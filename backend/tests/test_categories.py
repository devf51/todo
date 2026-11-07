import pytest

HUGE = 99999999999999999999


def cat(client, name="งาน"):
    return client.post("/api/categories", json={"name": name})


def todo(client, **extra):
    return client.post("/api/todos", json={"title": "t", **extra})


def test_create_category(client):
    r = cat(client, "  งาน  ")
    assert r.status_code == 201
    assert r.json()["name"] == "งาน"
    assert client.get("/api/categories").json() == [r.json()]


def test_duplicate_category_409(client):
    cat(client)
    r = cat(client)
    assert r.status_code == 409
    assert r.json() == {"detail": "category name already exists"}


@pytest.mark.parametrize("name", ["", "   ", "a" * 51])
def test_invalid_category_name_422(client, name):
    assert cat(client, name).status_code == 422
    assert client.get("/api/categories").json() == []


def test_list_categories_sorted(client):
    for n in ("b", "c", "a"):
        cat(client, n)
    assert [c["name"] for c in client.get("/api/categories").json()] == ["a", "b", "c"]


def test_rename_category_keeps_todo_link(client):
    c = cat(client).json()
    t = todo(client, category_id=c["id"]).json()
    r = client.patch(f"/api/categories/{c['id']}", json={"name": "ใหม่"})
    assert r.status_code == 200 and r.json() == {"id": c["id"], "name": "ใหม่"}
    assert client.get("/api/todos").json()[0]["category_id"] == c["id"] == t["category_id"]


def test_rename_to_existing_name_409(client):
    cat(client, "a")
    b = cat(client, "b").json()
    r = client.patch(f"/api/categories/{b['id']}", json={"name": "a"})
    assert r.status_code == 409
    assert r.json() == {"detail": "category name already exists"}


def test_rename_to_own_name_200(client):
    c = cat(client).json()
    assert client.patch(f"/api/categories/{c['id']}", json={"name": " งาน "}).status_code == 200


def test_delete_category_sets_todos_null(client):
    c = cat(client).json()
    t = todo(client, category_id=c["id"]).json()
    assert client.delete(f"/api/categories/{c['id']}").status_code == 204
    assert client.get("/api/categories").json() == []
    assert client.get("/api/todos").json() == [{**t, "category_id": None}]


def test_unknown_category_404(client):
    for r in (client.patch("/api/categories/7", json={"name": "x"}), client.delete("/api/categories/7")):
        assert r.status_code == 404
        assert r.json() == {"detail": "category not found"}


def test_todo_with_category(client):
    c = cat(client).json()
    r = todo(client, category_id=c["id"])
    assert r.status_code == 201 and r.json()["category_id"] == c["id"]
    t2 = todo(client).json()
    r = client.patch(f"/api/todos/{t2['id']}", json={"category_id": c["id"]})
    assert r.status_code == 200 and r.json()["category_id"] == c["id"]


def test_todo_unknown_category_422(client):
    r = todo(client, category_id=99)
    assert r.status_code == 422 and r.json() == {"detail": "category not found"}
    t = todo(client).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"category_id": 99})
    assert r.status_code == 422 and r.json() == {"detail": "category not found"}
    assert client.get("/api/todos").json() == [t]


def test_todo_category_null(client):
    c = cat(client).json()
    t = todo(client, category_id=c["id"]).json()
    assert todo(client, category_id=None).json()["category_id"] is None
    r = client.patch(f"/api/todos/{t['id']}", json={"category_id": None})
    assert r.status_code == 200 and r.json()["category_id"] is None
    # ไม่ส่ง category_id = ไม่เปลี่ยน
    t = todo(client, category_id=c["id"]).json()
    assert client.patch(f"/api/todos/{t['id']}", json={"done": True}).json()["category_id"] == c["id"]


@pytest.mark.parametrize("bad", [0, HUGE])
def test_huge_ids_422(client, bad):
    assert client.patch(f"/api/categories/{bad}", json={"name": "x"}).status_code == 422
    assert client.delete(f"/api/categories/{bad}").status_code == 422
    assert todo(client, category_id=bad).status_code == 422
    t = todo(client).json()
    assert client.patch(f"/api/todos/{t['id']}", json={"category_id": bad}).status_code == 422
