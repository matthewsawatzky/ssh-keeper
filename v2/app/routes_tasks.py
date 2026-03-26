from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import Task, Server, User
from app.auth import get_current_user

router = APIRouter(prefix="/api/servers/{server_id}/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    description: str


class TaskUpdate(BaseModel):
    completed: bool


@router.get("")
def list_tasks(
    server_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    tasks = db.query(Task).filter(Task.server_id == server_id).order_by(Task.created_at).all()
    return [
        {"id": t.id, "description": t.description, "completed": t.completed}
        for t in tasks
    ]


@router.post("")
def create_task(
    server_id: int,
    data: TaskCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    task = Task(server_id=server_id, description=data.description)
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"id": task.id, "description": task.description, "completed": task.completed}


@router.patch("/{task_id}")
def toggle_task(
    server_id: int,
    task_id: int,
    data: TaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.server_id == server_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.completed = data.completed
    db.commit()
    return {"id": task.id, "completed": task.completed}


@router.delete("/{task_id}")
def delete_task(
    server_id: int,
    task_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.server_id == server_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"message": "Deleted"}
