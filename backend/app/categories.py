import sqlite3
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Response
from pydantic import BaseModel, StringConstraints

from app.todos import Conn

router = APIRouter(prefix="/api/categories")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
CategoryId = Annotated[int, Path(ge=1, le=2**63 - 1)]


class Category(BaseModel):
    id: int
    name: str


class CategoryBody(BaseModel):
    name: Name


def _write(conn: sqlite3.Connection, sql: str, params: tuple) -> sqlite3.Cursor:
    try:
        return conn.execute(sql, params)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "category name already exists") from None


@router.get("")
def list_categories(conn: Conn) -> list[Category]:
    rows = conn.execute("SELECT id, name FROM categories ORDER BY name").fetchall()
    return [Category(**r) for r in rows]


@router.post("", status_code=201)
def create_category(body: CategoryBody, conn: Conn) -> Category:
    cur = _write(conn, "INSERT INTO categories (name) VALUES (?)", (body.name,))
    return Category(id=cur.lastrowid, name=body.name)


@router.patch("/{category_id}")
def rename_category(category_id: CategoryId, body: CategoryBody, conn: Conn) -> Category:
    cur = _write(conn, "UPDATE categories SET name = ? WHERE id = ?", (body.name, category_id))
    if cur.rowcount == 0:
        raise HTTPException(404, "category not found")
    return Category(id=category_id, name=body.name)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: CategoryId, conn: Conn) -> Response:
    cur = conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "category not found")
    return Response(status_code=204)
