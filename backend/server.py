from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import csv
import io
import json
import logging
import time
from collections import deque
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import List, Dict, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="TechnoDonate API")
api_router = APIRouter(prefix="/api")

# ---------- Pub/Sub for SSE ----------
subscribers: "set[asyncio.Queue]" = set()


async def _broadcast(event_type: str, payload: Optional[dict] = None):
    dead = []
    for q in list(subscribers):
        try:
            q.put_nowait({"type": event_type, "data": payload or {}})
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        subscribers.discard(q)


# ---------- Models ----------
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class MessageCreate(BaseModel):
    nickname: str
    message: str

    @model_validator(mode="before")
    @classmethod
    def _strip_inputs(cls, data):
        if isinstance(data, dict):
            for k in ("nickname", "message"):
                v = data.get(k)
                if isinstance(v, str):
                    data[k] = v.strip()
        return data

    @model_validator(mode="after")
    def _validate_lengths(self):
        if not self.nickname:
            raise ValueError("nickname is required")
        if not self.message:
            raise ValueError("message is required")
        if len(self.nickname) > 30:
            raise ValueError("nickname must be ≤ 30 characters")
        if len(self.message) > 200:
            raise ValueError("message must be ≤ 200 characters")
        return self


class ReactionCreate(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=8)


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nickname: str
    message: str
    # Native datetime; FastAPI/Pydantic serialize to ISO-8601 in JSON,
    # MongoDB stores as native BSON Date for proper locale-proof ordering.
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reactions: Dict[str, int] = Field(default_factory=dict)


ALLOWED_EMOJIS = {"🔥", "❤️", "✨", "🎉", "🤯", "👏", "💜", "🚀"}

# ---------- In-memory reaction rate limit ----------
# Sliding window: max REACT_LIMIT events per REACT_WINDOW_SEC per client IP.
REACT_LIMIT = int(os.environ.get("REACT_RATE_LIMIT", "30"))
REACT_WINDOW_SEC = int(os.environ.get("REACT_RATE_WINDOW_SEC", "60"))
_react_hits: "Dict[str, deque]" = {}
_react_lock = asyncio.Lock()


async def _check_rate_limit(ip: str) -> Optional[int]:
    """Return retry-after seconds if rate-limited, else None."""
    now = time.time()
    async with _react_lock:
        hits = _react_hits.setdefault(ip, deque())
        # Prune older than the window
        while hits and now - hits[0] > REACT_WINDOW_SEC:
            hits.popleft()
        if len(hits) >= REACT_LIMIT:
            oldest = hits[0]
            return max(1, int(REACT_WINDOW_SEC - (now - oldest)))
        hits.append(now)
        return None


def _ensure_aware(dt: datetime) -> datetime:
    """Mongo strips tzinfo on read; treat naïve datetimes as UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------- Default routes ----------
@api_router.get("/")
async def root():
    return {"message": "TechnoDonate API live"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    # status_checks already used ISO string in v1; keep behaviour for that collection
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for c in status_checks:
        if isinstance(c['timestamp'], str):
            c['timestamp'] = datetime.fromisoformat(c['timestamp'])
    return status_checks


# ---------- TechnoDonate routes ----------
@api_router.post("/messages", response_model=Message)
async def create_message(payload: MessageCreate):
    msg = Message(nickname=payload.nickname, message=payload.message)
    # Store native datetime → BSON Date in Mongo
    doc = msg.model_dump()
    await db.messages.insert_one(doc)
    await _broadcast("message.created", {"id": msg.id})
    return msg


@api_router.get("/messages", response_model=List[Message])
async def list_messages():
    docs = await db.messages.find({}, {"_id": 0}).sort("timestamp", 1).to_list(2000)
    for d in docs:
        d.setdefault("reactions", {})
        # Mongo returns naïve UTC datetimes; re-attach tzinfo for pydantic
        ts = d.get("timestamp")
        if isinstance(ts, datetime):
            d["timestamp"] = _ensure_aware(ts)
    return docs


@api_router.delete("/messages")
async def delete_all_messages():
    result = await db.messages.delete_many({})
    await _broadcast("messages.reset", {"deleted": result.deleted_count})
    return {"deleted": result.deleted_count}


@api_router.get("/messages/count")
async def message_count():
    total = await db.messages.count_documents({})
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today = await db.messages.count_documents({"timestamp": {"$gte": today_start}})
    return {"total": total, "today": today}


@api_router.post("/messages/{msg_id}/react", response_model=Message)
async def react_to_message(msg_id: str, payload: ReactionCreate, request: Request):
    emoji = payload.emoji
    if emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail="emoji not allowed")
    ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    retry_after = await _check_rate_limit(ip)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail=f"too many reactions; try again in {retry_after}s",
            headers={"Retry-After": str(retry_after)},
        )
    result = await db.messages.find_one_and_update(
        {"id": msg_id},
        {"$inc": {f"reactions.{emoji}": 1}},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="message not found")
    result.setdefault("reactions", {})
    ts = result.get("timestamp")
    if isinstance(ts, datetime):
        result["timestamp"] = _ensure_aware(ts)
    await _broadcast("reaction.added", {"id": msg_id, "emoji": emoji})
    return result


# ---------- CSV export ----------
@api_router.get("/messages/export.csv")
async def export_messages_csv():
    """Export all messages with reactions as a CSV for post-event analytics."""
    docs = await db.messages.find({}, {"_id": 0}).sort("timestamp", 1).to_list(5000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    columns = ["id", "nickname", "message", "timestamp", "total_reactions"] + sorted(
        ALLOWED_EMOJIS
    )
    writer.writerow(columns)
    for d in docs:
        reactions = d.get("reactions") or {}
        total = sum(int(v or 0) for v in reactions.values())
        ts = d.get("timestamp")
        if isinstance(ts, datetime):
            ts = _ensure_aware(ts).isoformat()
        writer.writerow(
            [
                d.get("id", ""),
                d.get("nickname", ""),
                d.get("message", ""),
                ts or "",
                total,
            ]
            + [int(reactions.get(e, 0) or 0) for e in sorted(ALLOWED_EMOJIS)]
        )
    csv_text = buf.getvalue()
    today_tag = datetime.now(timezone.utc).strftime("%Y%m%d")
    return PlainTextResponse(
        csv_text,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="technodonate-{today_tag}.csv"'
        },
    )


# ---------- SSE stream ----------
@api_router.get("/messages/stream")
async def messages_stream(request: Request):
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    subscribers.add(queue)

    async def event_gen():
        try:
            yield "event: hello\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: {evt['type']}\ndata: {json.dumps(evt['data'])}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            subscribers.discard(queue)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def migrate_string_timestamps():
    """Convert legacy ISO-string timestamps to native BSON Date."""
    try:
        cursor = db.messages.find(
            {"timestamp": {"$type": "string"}},
            {"_id": 1, "timestamp": 1},
        )
        migrated = 0
        async for doc in cursor:
            try:
                dt = datetime.fromisoformat(doc["timestamp"])
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                await db.messages.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"timestamp": dt}},
                )
                migrated += 1
            except Exception as e:
                logger.warning("Skipping timestamp migration for %s: %s", doc.get("_id"), e)
        if migrated:
            logger.info("Migrated %d message timestamps to BSON Date.", migrated)
    except Exception as e:
        logger.exception("Timestamp migration failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
