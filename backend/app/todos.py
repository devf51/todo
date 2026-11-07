import re
import sqlite3
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from pydantic import AfterValidator, BaseModel, StrictStr, StringConstraints

from app.db import connect

router = APIRouter(prefix="/api/todos")

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Priority = Literal["low", "medium", "high"]


def _real_date(v: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        raise ValueError("due_date must be YYYY-MM-DD")
    date.fromisoformat(v)  # ปฏิเสธวันที่ที่ไม่มีจริง เช่น 2026-02-30
    return v


DueDate = Annotated[StrictStr, AfterValidator(_real_date)]
TodoId = Annotated[int, Path(ge=1, le=2**63 - 1)]
COLUMNS = "id, title, done, due_date, priority, category_id"


class Todo(BaseModel):
    id: int
    title: str
    done: bool
    due_date: str | None
    priority: Priority
    category_id: int | None


class TodoCreate(BaseModel):
    title: Title
    due_date: DueDate | None = None
    priority: Priority = "medium"


class TodoPatch(BaseModel):
    title: Title | None = None
    done: bool | None = None
    due_date: DueDate | None = None
    priority: Priority | None = None


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
    rows = conn.execute(f"SELECT {COLUMNS} FROM todos ORDER BY due_date IS NULL, due_date, id").fetchall()
    return [Todo(**r) for r in rows]


@router.post("", status_code=201)
def create_todo(body: TodoCreate, conn: Conn) -> Todo:
    cur = conn.execute(
        "INSERT INTO todos (title, due_date, priority) VALUES (?, ?, ?)",
        (body.title, body.due_date, body.priority),
    )
    return _get(conn, cur.lastrowid)


@router.patch("/{todo_id}")
def patch_todo(todo_id: TodoId, body: TodoPatch, conn: Conn) -> Todo:
    # ชื่อคอลัมน์มาจาก field ของ model เท่านั้น ไม่ใช่ key จาก body
    changes = body.model_dump(exclude_unset=True)
    if any(changes.get(k, 0) is None for k in ("title", "done", "priority")):
        raise HTTPException(422, "title, done and priority cannot be null")
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
