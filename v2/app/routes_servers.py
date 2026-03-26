from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import Server, User
from app.auth import get_current_user

router = APIRouter(prefix="/api/servers", tags=["servers"])


class ServerCreate(BaseModel):
    name: str
    default_ip: str
    secondary_ip: Optional[str] = ""
    port: int = 22
    ssh_user: str
    notes: Optional[str] = ""
    monitor_tool: Optional[str] = "btop"


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    default_ip: Optional[str] = None
    secondary_ip: Optional[str] = None
    port: Optional[int] = None
    ssh_user: Optional[str] = None
    notes: Optional[str] = None
    monitor_tool: Optional[str] = None


class DeleteConfirm(BaseModel):
    confirm_name: str


@router.get("")
def list_servers(
    search: str = Query("", description="Search by name"),
    page: int = Query(1, ge=1),
    per_page: int = Query(12, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Server)
    if search:
        query = query.filter(Server.name.ilike(f"%{search}%"))
    total = query.count()
    servers = query.order_by(Server.name).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "servers": [
            {
                "id": s.id,
                "name": s.name,
                "default_ip": s.default_ip,
                "secondary_ip": s.secondary_ip,
                "port": s.port,
                "ssh_user": s.ssh_user,
                "notes": s.notes,
                "monitor_tool": s.monitor_tool,
                "task_count": len(s.tasks),
                "tasks_completed": sum(1 for t in s.tasks if t.completed),
            }
            for s in servers
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


@router.post("")
def create_server(
    data: ServerCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = Server(**data.model_dump())
    db.add(server)
    db.commit()
    db.refresh(server)
    return {"id": server.id, "name": server.name}


@router.get("/{server_id}")
def get_server(
    server_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return {
        "id": server.id,
        "name": server.name,
        "default_ip": server.default_ip,
        "secondary_ip": server.secondary_ip,
        "port": server.port,
        "ssh_user": server.ssh_user,
        "notes": server.notes,
        "monitor_tool": server.monitor_tool,
    }


@router.put("/{server_id}")
def update_server(
    server_id: int,
    data: ServerUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(server, key, value)
    db.commit()
    return {"message": "Updated"}


@router.delete("/{server_id}")
def delete_server(
    server_id: int,
    data: DeleteConfirm,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if data.confirm_name != server.name:
        raise HTTPException(status_code=400, detail="Server name does not match")
    db.delete(server)
    db.commit()
    return {"message": "Deleted"}
