import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  due_date    TEXT    NULL,
  priority    TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL
);
"""


def connect(db_path: str) -> sqlite3.Connection:
    # connection ต่อ request ไม่แชร์ข้าม request แต่ FastAPI เปิด/ปิดใน thread ต่างกันได้
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: str) -> None:
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()
