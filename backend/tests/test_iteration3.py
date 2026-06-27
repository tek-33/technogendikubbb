"""Backend tests for TechnoDonate iteration 3: native BSON datetime timestamps & startup migration."""
import os
import time
import datetime
import subprocess
import pytest
import requests
from pathlib import Path
from pymongo import MongoClient
from dotenv import load_dotenv


def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


load_dotenv("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    mc = MongoClient(MONGO_URL)
    yield mc[DB_NAME]
    mc.close()


@pytest.fixture(autouse=True)
def cleanup(client):
    client.delete(f"{API}/messages")
    yield
    client.delete(f"{API}/messages")


class TestNativeDatetime:
    def test_post_stores_native_datetime_in_mongo(self, client, mongo):
        r = client.post(f"{API}/messages", json={"nickname": "TEST_dt", "message": "datetime test"})
        assert r.status_code == 200
        mid = r.json()["id"]
        # Confirm BSON type via pymongo
        doc = mongo.messages.find_one({"id": mid})
        assert doc is not None, "Message not found in Mongo"
        ts = doc["timestamp"]
        assert isinstance(ts, datetime.datetime), (
            f"Expected datetime.datetime, got {type(ts).__name__} ({ts!r})"
        )

    def test_get_returns_iso_string_in_json(self, client):
        client.post(f"{API}/messages", json={"nickname": "TEST_iso", "message": "iso test"})
        r = client.get(f"{API}/messages")
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 1
        ts = msgs[0]["timestamp"]
        assert isinstance(ts, str)
        # parseable as ISO-8601
        parsed = datetime.datetime.fromisoformat(ts)
        assert isinstance(parsed, datetime.datetime)

    def test_ascending_sort_with_native_datetime(self, client):
        for i in range(3):
            r = client.post(f"{API}/messages", json={"nickname": f"TEST_o{i}", "message": f"m{i}"})
            assert r.status_code == 200
            time.sleep(0.06)
        msgs = client.get(f"{API}/messages").json()
        assert len(msgs) == 3
        assert [m["nickname"] for m in msgs] == ["TEST_o0", "TEST_o1", "TEST_o2"]
        # Timestamps strictly increasing
        ts_vals = [datetime.datetime.fromisoformat(m["timestamp"]) for m in msgs]
        assert ts_vals == sorted(ts_vals)

    def test_count_today_uses_datetime(self, client):
        client.post(f"{API}/messages", json={"nickname": "TEST_c", "message": "count me"})
        r = client.get(f"{API}/messages/count")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert data["today"] >= 1


class TestStartupMigration:
    def test_string_timestamp_migrated_to_datetime_on_startup(self, client, mongo):
        # Insert a legacy doc with STRING timestamp directly via pymongo
        legacy_id = "TEST_legacy_migration_uuid"
        legacy_ts_str = "2026-06-27T05:00:00+00:00"
        mongo.messages.delete_many({"id": legacy_id})
        mongo.messages.insert_one({
            "id": legacy_id,
            "nickname": "TEST_legacy",
            "message": "legacy ts",
            "timestamp": legacy_ts_str,
            "reactions": {},
        })
        # confirm it really is a string before restart
        pre = mongo.messages.find_one({"id": legacy_id})
        assert isinstance(pre["timestamp"], str), f"setup failed: {type(pre['timestamp'])}"

        # Restart backend to trigger startup migration
        subprocess.run(
            ["sudo", "supervisorctl", "restart", "backend"],
            check=True, capture_output=True,
        )
        # Wait for backend to come back up and migration to run
        deadline = time.time() + 25
        ready = False
        while time.time() < deadline:
            try:
                if client.get(f"{API}/", timeout=3).status_code == 200:
                    ready = True
                    break
            except Exception:
                pass
            time.sleep(0.5)
        assert ready, "backend did not come back online after restart"
        # Give migration a moment to finish
        time.sleep(1.5)

        post = mongo.messages.find_one({"id": legacy_id})
        assert post is not None
        assert isinstance(post["timestamp"], datetime.datetime), (
            f"Expected datetime after migration, got {type(post['timestamp']).__name__}"
        )
        # Value preserved (compare UTC)
        expected = datetime.datetime.fromisoformat(legacy_ts_str)
        got = post["timestamp"]
        if got.tzinfo is None:
            got = got.replace(tzinfo=datetime.timezone.utc)
        assert got == expected, f"Migrated value mismatch: {got} vs {expected}"

        # Cleanup legacy doc
        mongo.messages.delete_many({"id": legacy_id})


# ---------- Iteration 2 regression coverage (lightweight) ----------
class TestIteration2Regression:
    def test_whitespace_only_rejected(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "   ", "message": "hi"})
        assert r.status_code == 422

    def test_react_allowed_increments(self, client):
        mid = client.post(f"{API}/messages", json={"nickname": "TEST_r", "message": "r"}).json()["id"]
        r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
        assert r.status_code == 200
        assert r.json()["reactions"].get("🔥") == 1

    def test_react_disallowed_returns_400(self, client):
        mid = client.post(f"{API}/messages", json={"nickname": "TEST_r", "message": "r"}).json()["id"]
        r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "💩"})
        assert r.status_code == 400

    def test_react_unknown_id_returns_404(self, client):
        r = client.post(f"{API}/messages/unknown-id/react", json={"emoji": "🔥"})
        assert r.status_code == 404

    def test_sse_hello_event(self, client):
        with requests.get(f"{API}/messages/stream", stream=True, timeout=10) as resp:
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers.get("Content-Type", "")
            buf = b""
            start = time.time()
            for chunk in resp.iter_content(chunk_size=64):
                if chunk:
                    buf += chunk
                    if b"event: hello" in buf:
                        break
                if time.time() - start > 8:
                    break
            assert b"event: hello" in buf
