import pytest
from fastapi.testclient import TestClient

from app.main import create_app

HUGE = 99999999999999999999


def make(client, title="ซื้อนม"):
    return client.post("/api/todos", json={"title": title})


def test_create_todo_returns_201_with_defaults(client):
    r = make(client)
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "ซื้อนม"
    assert body["done"] is False
    assert body["due_date"] is None
    assert body["priority"] == "medium"
    assert body["category_id"] is None
    assert client.get("/api/todos").json() == [body]


def test_create_todo_trims_title(client):
    assert make(client, "  ซื้อนม  ").json()["title"] == "ซื้อนม"


@pytest.mark.parametrize("title", ["", "   ", "a" * 201])
def test_create_todo_rejects_empty_blank_and_too_long_title(client, title):
    assert make(client, title).status_code == 422
    assert client.get("/api/todos").json() == []


def test_list_todos(client):
    a = make(client, "a").json()
    b = make(client, "b").json()
    assert client.get("/api/todos").json() == [a, b]


def test_patch_done_true_and_false(client):
    t = make(client).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"done": True})
    assert r.status_code == 200 and r.json()["done"] is True
    assert client.get("/api/todos").json()[0]["done"] is True
    r = client.patch(f"/api/todos/{t['id']}", json={"done": False})
    assert r.json()["done"] is False


def test_patch_title(client):
    t = make(client).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"title": " ใหม่ "})
    assert r.status_code == 200 and r.json()["title"] == "ใหม่"
    assert client.get("/api/todos").json()[0]["title"] == "ใหม่"


def test_patch_rejects_blank_title(client):
    t = make(client).json()
    assert client.patch(f"/api/todos/{t['id']}", json={"title": "  "}).status_code == 422


def test_delete_todo(client):
    t = make(client).json()
    assert client.delete(f"/api/todos/{t['id']}").status_code == 204
    assert client.get("/api/todos").json() == []


def test_patch_and_delete_unknown_id_404(client):
    for r in (client.patch("/api/todos/5", json={"done": True}), client.delete("/api/todos/5")):
        assert r.status_code == 404
        assert r.json() == {"detail": "todo not found"}


def test_patch_null_title_or_done_422(client):
    t = make(client).json()
    for body in ({"title": None}, {"done": None}):
        assert client.patch(f"/api/todos/{t['id']}", json=body).status_code == 422


def test_patch_empty_body_returns_unchanged(client):
    t = make(client).json()
    r = client.patch(f"/api/todos/{t['id']}", json={})
    assert r.status_code == 200 and r.json() == t


@pytest.mark.parametrize("bad", [0, HUGE])
def test_huge_or_zero_id_422(client, bad):
    assert client.patch(f"/api/todos/{bad}", json={"done": True}).status_code == 422
    assert client.delete(f"/api/todos/{bad}").status_code == 422


def test_data_persists_across_app_instances(tmp_path):
    path = str(tmp_path / "p.db")
    t = make(TestClient(create_app(path))).json()
    assert TestClient(create_app(path)).get("/api/todos").json() == [t]


def test_create_with_due_date_and_priority(client):
    r = client.post("/api/todos", json={"title": "x", "due_date": "2026-12-31", "priority": "high"})
    assert r.status_code == 201
    assert r.json()["due_date"] == "2026-12-31" and r.json()["priority"] == "high"


def test_defaults_when_omitted(client):
    t = make(client).json()
    assert t["due_date"] is None and t["priority"] == "medium"


@pytest.mark.parametrize("bad", ["31/12/2026", "2026-02-30", 20261231, "2026-12-31T00:00:00"])
def test_invalid_due_date_422(client, bad):
    r = client.post("/api/todos", json={"title": "x", "due_date": bad})
    assert r.status_code == 422
    assert client.get("/api/todos").json() == []


def test_invalid_priority_422(client):
    assert client.post("/api/todos", json={"title": "x", "priority": "urgent"}).status_code == 422


def test_patch_due_date_and_priority(client):
    t = make(client).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"due_date": "2027-01-02", "priority": "low"})
    assert r.status_code == 200
    assert r.json()["due_date"] == "2027-01-02" and r.json()["priority"] == "low"
    assert client.get("/api/todos").json()[0]["priority"] == "low"


def test_patch_due_date_null_clears(client):
    t = client.post("/api/todos", json={"title": "x", "due_date": "2026-12-31"}).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"due_date": None})
    assert r.status_code == 200 and r.json()["due_date"] is None


def test_patch_without_due_date_keeps_value(client):
    t = client.post("/api/todos", json={"title": "x", "due_date": "2026-12-31"}).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"done": True})
    assert r.json()["due_date"] == "2026-12-31"


def test_patch_priority_null_422(client):
    t = make(client).json()
    assert client.patch(f"/api/todos/{t['id']}", json={"priority": None}).status_code == 422


def test_list_sorted_by_due_date_nulls_last(client):
    def add(title, due):
        return client.post("/api/todos", json={"title": title, "due_date": due}).json()["title"]

    for title, due in [("none", None), ("late", "2027-01-01"), ("soon", "2026-01-01"), ("soon2", "2026-01-01")]:
        add(title, due)
    assert [t["title"] for t in client.get("/api/todos").json()] == ["soon", "soon2", "late", "none"]


def test_concurrent_requests_all_succeed(tmp_path):
    # TestClient รันใน thread เดียว จึงไม่เจอบั๊ก connection ข้าม thread ต้องใช้ uvicorn จริง
    import os
    import socket
    import subprocess
    import sys
    import time
    from concurrent.futures import ThreadPoolExecutor

    import httpx

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    env = {**os.environ, "DATABASE_PATH": str(tmp_path / "c.db")}
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{port}/api/todos"
    try:
        for _ in range(100):
            try:
                httpx.get(url)
                break
            except httpx.TransportError:
                time.sleep(0.1)
        with httpx.Client(limits=httpx.Limits(max_connections=40)) as c, ThreadPoolExecutor(30) as ex:
            codes = list(ex.map(lambda i: c.post(url, json={"title": f"t{i}"}).status_code, range(300)))
        assert codes == [201] * 300
        assert len(httpx.get(url).json()) == 300
    finally:
        server.terminate()
        server.wait()


def _filter_data(client):
    c = client.post("/api/categories", json={"name": "งาน"}).json()["id"]
    rows = [("a", "high", c, False), ("b", "high", None, True), ("c", "low", c, True), ("d", "medium", c, False)]
    for title, prio, cat, done in rows:
        t = client.post("/api/todos", json={"title": title, "priority": prio, "category_id": cat}).json()
        if done:
            client.patch(f"/api/todos/{t['id']}", json={"done": True})
    return c


def _titles(client, query):
    r = client.get(f"/api/todos{query}")
    assert r.status_code == 200
    return [t["title"] for t in r.json()]


def test_filter_status_active_done_all(client):
    _filter_data(client)
    assert _titles(client, "?status=active") == ["a", "d"]
    assert _titles(client, "?status=done") == ["b", "c"]
    assert _titles(client, "?status=all") == _titles(client, "") == ["a", "b", "c", "d"]


def test_filter_category(client):
    c = _filter_data(client)
    assert _titles(client, f"?category_id={c}") == ["a", "c", "d"]


def test_filter_priority(client):
    _filter_data(client)
    assert _titles(client, "?priority=high") == ["a", "b"]


def test_filter_combined(client):
    c = _filter_data(client)
    assert _titles(client, f"?status=active&priority=high&category_id={c}") == ["a"]


@pytest.mark.parametrize("query", ["?status=xxx", "?priority=xxx", "?category_id=abc", "?category_id=99999999999999999999"])
def test_filter_invalid_values_422(client, query):
    assert client.get(f"/api/todos{query}").status_code == 422


def test_filter_unknown_category_empty(client):
    _filter_data(client)
    assert _titles(client, "?category_id=999") == []
