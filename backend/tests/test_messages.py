"""Backend tests for TechnoDonate messages API (iteration 2)."""
import os
import time
import json
import pytest
import requests
from pathlib import Path

def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(autouse=True)
def cleanup(client):
    # purge before each test for isolation
    client.delete(f"{API}/messages")
    yield
    client.delete(f"{API}/messages")


# ---------- Health ----------
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert "TechnoDonate" in r.json().get("message", "")


# ---------- CRUD ----------
class TestMessages:
    def test_create_returns_id_and_timestamp(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "TEST_user", "message": "hello cosmos"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["id"], str) and len(data["id"]) > 0
        assert isinstance(data["timestamp"], str)
        assert data["nickname"] == "TEST_user"
        assert data["message"] == "hello cosmos"
        assert data.get("reactions") == {}

    def test_create_persists_via_get(self, client):
        client.post(f"{API}/messages", json={"nickname": "TEST_a", "message": "first"})
        time.sleep(0.05)
        client.post(f"{API}/messages", json={"nickname": "TEST_b", "message": "second"})
        r = client.get(f"{API}/messages")
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) == 2
        assert msgs[0]["nickname"] == "TEST_a"
        assert msgs[1]["nickname"] == "TEST_b"
        # Each message has reactions dict (default empty)
        for m in msgs:
            assert isinstance(m.get("reactions"), dict)

    def test_count_total_and_today(self, client):
        for i in range(3):
            client.post(f"{API}/messages", json={"nickname": f"TEST_{i}", "message": "x"})
        r = client.get(f"{API}/messages/count")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 3
        assert data["today"] >= 3

    def test_delete_all_clears(self, client):
        client.post(f"{API}/messages", json={"nickname": "TEST_x", "message": "to delete"})
        r = client.delete(f"{API}/messages")
        assert r.status_code == 200
        assert "deleted" in r.json()
        r2 = client.get(f"{API}/messages")
        assert r2.json() == []


# ---------- Validation (iteration 2: whitespace-only rejected) ----------
class TestValidation:
    def test_reject_empty_nickname(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "", "message": "hi"})
        assert r.status_code == 422

    def test_reject_empty_message(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "ok", "message": ""})
        assert r.status_code == 422

    def test_reject_whitespace_only_nickname(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "   ", "message": "hi"})
        assert r.status_code == 422, r.text

    def test_reject_whitespace_only_message(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "ok", "message": "   \t\n"})
        assert r.status_code == 422, r.text

    def test_reject_nickname_too_long(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "a" * 31, "message": "hi"})
        assert r.status_code == 422

    def test_reject_message_too_long(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "ok", "message": "m" * 201})
        assert r.status_code == 422

    def test_accept_boundary_lengths(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "a" * 30, "message": "m" * 200})
        assert r.status_code == 200

    def test_whitespace_padded_stripped_and_stored(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "  Bob  ", "message": "  hi there  "})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["nickname"] == "Bob"
        assert data["message"] == "hi there"
        # verify persisted stripped value via GET
        g = client.get(f"{API}/messages")
        assert g.status_code == 200
        msgs = g.json()
        assert any(m["nickname"] == "Bob" and m["message"] == "hi there" for m in msgs)


# ---------- Reactions (iteration 2) ----------
ALLOWED = ["🔥", "❤️", "✨", "🎉", "🤯", "👏", "💜", "🚀"]


class TestReactions:
    def _make_msg(self, client):
        r = client.post(f"{API}/messages", json={"nickname": "TEST_r", "message": "react me"})
        assert r.status_code == 200
        return r.json()["id"]

    def test_react_allowed_emoji_increments(self, client):
        mid = self._make_msg(client)
        r1 = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
        assert r1.status_code == 200, r1.text
        data1 = r1.json()
        assert data1["reactions"].get("🔥") == 1
        r2 = client.post(f"{API}/messages/{mid}/react", json={"emoji": "🔥"})
        assert r2.status_code == 200
        assert r2.json()["reactions"].get("🔥") == 2
        # verify via GET
        g = client.get(f"{API}/messages")
        m = next(x for x in g.json() if x["id"] == mid)
        assert m["reactions"].get("🔥") == 2

    def test_react_multiple_emojis(self, client):
        mid = self._make_msg(client)
        for e in ["❤️", "✨", "🚀"]:
            r = client.post(f"{API}/messages/{mid}/react", json={"emoji": e})
            assert r.status_code == 200, f"{e}: {r.text}"
        g = client.get(f"{API}/messages")
        m = next(x for x in g.json() if x["id"] == mid)
        assert m["reactions"].get("❤️") == 1
        assert m["reactions"].get("✨") == 1
        assert m["reactions"].get("🚀") == 1

    def test_react_disallowed_emoji_returns_400(self, client):
        mid = self._make_msg(client)
        r = client.post(f"{API}/messages/{mid}/react", json={"emoji": "💩"})
        assert r.status_code == 400, r.text
        assert "emoji" in r.json().get("detail", "").lower()

    def test_react_nonexistent_message_returns_404(self, client):
        r = client.post(f"{API}/messages/does-not-exist-uuid/react", json={"emoji": "🔥"})
        assert r.status_code == 404, r.text


# ---------- SSE stream (iteration 2) ----------
class TestSSE:
    def test_stream_content_type_and_hello(self, client):
        url = f"{API}/messages/stream"
        # Use stream=True; read minimal bytes to confirm Content-Type and hello event
        with requests.get(url, stream=True, timeout=10) as resp:
            assert resp.status_code == 200
            ctype = resp.headers.get("Content-Type", "")
            assert "text/event-stream" in ctype, f"Unexpected Content-Type: {ctype}"
            # read up to 1KB or first hello event
            buf = b""
            start = time.time()
            for chunk in resp.iter_content(chunk_size=64):
                if chunk:
                    buf += chunk
                    if b"event: hello" in buf:
                        break
                if time.time() - start > 8:
                    break
            assert b"event: hello" in buf, f"hello event not seen in stream. Got: {buf[:300]!r}"
