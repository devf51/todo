import os

from fastapi import FastAPI

from app.categories import router as categories_router
from app.db import init_db
from app.todos import router as todos_router


def create_app(db_path: str) -> FastAPI:
    init_db(db_path)
    app = FastAPI()
    app.state.db_path = db_path
    app.include_router(todos_router)
    app.include_router(categories_router)
    return app


app = create_app(os.environ.get("DATABASE_PATH", "todo.db"))
