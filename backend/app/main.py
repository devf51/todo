import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.categories import router as categories_router
from app.db import init_db
from app.todos import router as todos_router


def create_app(db_path: str, static_dir: str | None = None) -> FastAPI:
    init_db(db_path)
    app = FastAPI()
    app.state.db_path = db_path
    app.include_router(todos_router)
    app.include_router(categories_router)
    # mount หลัง router /api เพื่อให้ /api/* ถูกจับก่อน; โฟลเดอร์ไม่มี → StaticFiles raise ทำให้ start ไม่ขึ้น
    if static_dir:
        app.mount("/", StaticFiles(directory=static_dir, html=True))
    return app


app = create_app(os.environ.get("DATABASE_PATH", "todo.db"), os.environ.get("STATIC_DIR"))
