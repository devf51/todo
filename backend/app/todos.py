import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from pydantic import BaseModel, StringConstraints

from app.db import connect

router = APIRouter(prefix="/api/todos")

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
TodoId = Annotated[int, Path(ge=1, le=2**63 - 1)]
COLUMNS = "id, title, done, due_date, priority, category_id"


class Todo(BaseModel):
    id: int
    title: str
    done: bool
    due_date: str | None
    priority: Literal["low", "medium", "high"]
    category_id: int | None


class TodoCreate(BaseModel):
    title: Title


class TodoPatch(BaseModel):
    title: Title | None = None
    done: bool | None = None


def get_conn(request: Request):
    conn = connect(request.app.state.db_path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


Conn = Annotated[sqlite3.Connection, Depends(get_conn)]


def _get(conn: sqlite3.Connection, todo_id: int) -> Todo:
    row = conn.execute(f"SELECT {COLUMNS} FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "todo not found")
    return Todo(**row)


@router.get("")
def list_todos(conn: Conn) -> list[Todo]:
    rows = conn.execute(f"SELECT {COLUMNS} FROM todos ORDER BY id").fetchall()
    return [Todo(**r) for r in rows]


@router.post("", status_code=201)
def create_todo(body: TodoCreate, conn: Conn) -> Todo:
    cur = conn.execute("INSERT INTO todos (title) VALUES (?)", (body.title,))
    return _get(conn, cur.lastrowid)


@router.patch("/{todo_id}")
def patch_todo(todo_id: TodoId, body: TodoPatch, conn: Conn) -> Todo:
    # ชื่อคอลัมน์มาจาก field ของ model เท่านั้น ไม่ใช่ key จาก body
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] is None or "done" in changes and changes["done"] is None:
        raise HTTPException(422, "title and done cannot be null")
    if changes:
        sets = ", ".join(f"{k} = ?" for k in changes)
        cur = conn.execute(f"UPDATE todos SET {sets} WHERE id = ?", (*changes.values(), todo_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "todo not found")
    return _get(conn, todo_id)


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: TodoId, conn: Conn) -> Response:
    cur = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "todo not found")
    return Response(status_code=204)
