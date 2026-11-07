import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def static_dir(tmp_path):
    d = tmp_path / "static"
    d.mkdir()
    (d / "index.html").write_text('<div id="root"></div>')
    (d / "app.js").write_text("console.log(1)")
    return d


def test_serves_index_html(tmp_path, static_dir):
    c = TestClient(create_app(str(tmp_path / "t.db"), str(static_dir)))
    r = c.get("/")
    assert r.status_code == 200
    assert '<div id="root"></div>' in r.text
    assert c.get("/app.js").text == "console.log(1)"


def test_api_still_json_with_static(tmp_path, static_dir):
    c = TestClient(create_app(str(tmp_path / "t.db"), str(static_dir)))
    assert c.post("/api/todos", json={"title": "x"}).status_code == 201
    r = c.get("/api/todos")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert r.json()[0]["title"] == "x"
    assert c.get("/api/categories").json() == []


def test_no_static_dir_root_404(client):
    assert client.get("/").status_code == 404


def test_missing_static_dir_raises(tmp_path):
    with pytest.raises(RuntimeError):
        create_app(str(tmp_path / "t.db"), str(tmp_path / "nope"))
