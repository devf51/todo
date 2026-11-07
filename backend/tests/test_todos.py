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
