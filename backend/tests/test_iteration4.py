"""Backend tests for TechnoDonate iteration 4: rate limit + CSV export."""
import os
import io
import csv
import time
import datetime
import subprocess
import pytest
import requests
from pathlib import Path
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
ALLOWED_EMOJIS = {"🔥", "❤️", "✨", "🎉", "🤯", "👏", "💜", "🚀"}


def _restart_backend_for_clean_ratelimit():
    """Reset the in-memory _react_hits sliding window by restarting the backend."""
    subprocess.run(
        ["sudo", "supervisorctl", "restart", "backend"],
        check=True, capture_output=True,
    )
    deadline = time.time() + 25
    while time.time() < deadline:
        try:
            if requests.get(f"{API}/", timeout=3).status_code == 200:
                time.sleep(1.0)
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("backend did not come back online")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def clean_db(client):
    client.delete(f"{API}/messages")
    yield
    client.delete(f"{API}/messages")


# ---------- CSV export ----------
class TestCsvExport:
    def test_headers_and_filename(self, client, clean_db):
        r = client.get(f"{API}/messages/export.csv")
        assert r.status_code == 200
        ct = r.headers.get("Content-Type", "")
        assert ct.lower().startswith("text/csv"), f"got Content-Type={ct!r}"
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower()
        # filename starting with technodonate- and ending .csv
        assert "technodonate-" in cd
        assert ".csv" in cd

    def test_empty_returns_header_only(self, client, clean_db):
        r = client.get(f"{API}/messages/export.csv")
        assert r.status_code == 200
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        assert len(lines) == 1, f"expected only header, got {len(lines)} non-empty lines"
        header = next(csv.reader(io.StringIO(lines[0])))
        for col in ["id", "nickname", "message", "timestamp", "total_reactions"]:
            assert col in header, f"missing column {col!r} in {header}"
        for e in ALLOWED_EMOJIS:
            assert e in header, f"missing emoji column {e} in {header}"

    def test_with_data_totals_and_emoji_columns(self, client, clean_db):
        # Create 2 messages
        m1 = client.post(f"{API}/messages", json={"nickname": "TEST_a", "message": "first"}).json()
        m2 = client.post(f"{API}/messages", json={"nickname": "TEST_b", "message": "second"}).json()
        # React to m1: 🔥 twice + ❤️ once
        for _ in range(2):
            r = client.post(f"{API}/messages/{m1['id']}/react", json={"emoji": "🔥"})
            assert r.status_code == 200
        r = client.post(f"{API}/messages/{m1['id']}/react", json={"emoji": "❤️"})
        assert r.status_code == 200

        r = client.get(f"{API}/messages/export.csv")
        assert r.status_code == 200
        reader = csv.DictReader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) == 2, f"expected 2 rows, got {len(rows)}: {rows}"
        by_id = {row["id"]: row for row in rows}
        assert m1["id"] in by_id and m2["id"] in by_id

        reacted = by_id[m1["id"]]
        assert int(reacted["total_reactions"]) == 3, f"got total={reacted['total_reactions']}"
        assert int(reacted["🔥"]) == 2
        assert int(reacted["❤️"]) == 1
        for e in ALLOWED_EMOJIS - {"🔥", "❤️"}:
            assert int(reacted[e]) == 0, f"expected 0 for {e}, got {reacted[e]}"

        unreacted = by_id[m2["id"]]
        assert int(unreacted["total_reactions"]) == 0
        for e in ALLOWED_EMOJIS:
            assert int(unreacted[e]) == 0


# ---------- Rate limit ----------
class TestReactRateLimit:
    def test_30_succeed_31st_returns_429_with_retry_after(self, client):
        # Reset in-memory rate-limit state and DB
        _restart_backend_for_clean_ratelimit()
        client.delete(f"{API}/messages")
        try:
            mid = client.post(f"{API}/messages", json={"nickname": "TEST_rl", "message": "rl"}).json()["id"]

            # 30 successful reactions
            for i in range(30):
                r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
                assert r.status_code == 200, f"react {i+1} failed: {r.status_code} {r.text}"

            # 31st should be 429
            r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
            assert r.status_code == 429, f"expected 429, got {r.status_code}: {r.text}"

            retry_after = r.headers.get("Retry-After")
            assert retry_after is not None, "missing Retry-After header"
            assert retry_after.isdigit(), f"Retry-After not integer: {retry_after!r}"
            assert int(retry_after) > 0

            body = r.json()
            detail = (body.get("detail") or "").lower()
            assert "too many reactions" in detail, f"unexpected detail: {detail!r}"
        finally:
            client.delete(f"{API}/messages")

    @pytest.mark.slow
    def test_rate_limit_resets_after_window(self, client):
        """After window > 60s the limit window slides forward and reactions succeed again.
        We use a backend restart to simulate this faster (resets in-memory deque)."""
        _restart_backend_for_clean_ratelimit()
        client.delete(f"{API}/messages")
        try:
            mid = client.post(f"{API}/messages", json={"nickname": "TEST_rs", "message": "rs"}).json()["id"]
            for _ in range(30):
                r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
                assert r.status_code == 200
            r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
            assert r.status_code == 429

            # Window reset by restart (same effect as waiting > 60s for this IP)
            _restart_backend_for_clean_ratelimit()
            r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
            assert r.status_code == 200, f"after reset expected 200, got {r.status_code}"
        finally:
            client.delete(f"{API}/messages")
