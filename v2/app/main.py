from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pathlib import Path

from app.database import engine, Base
from app.routes_auth import router as auth_router
from app.routes_servers import router as servers_router
from app.routes_tasks import router as tasks_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SSH Keeper")

static_dir = Path(__file__).parent.parent / "static"
templates_dir = Path(__file__).parent.parent / "templates"

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

app.include_router(auth_router)
app.include_router(servers_router)
app.include_router(tasks_router)


@app.get("/", response_class=HTMLResponse)
async def index():
    return (templates_dir / "index.html").read_text()
