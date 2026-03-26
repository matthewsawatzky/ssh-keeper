from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
import pyotp
import qrcode
import qrcode.image.svg
import io
import base64
import re

from app.database import get_db
from app.models import User
from app.auth import (
    hash_password, verify_password, generate_totp_secret,
    verify_totp, get_totp_uri, create_access_token, get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 10:
            raise ValueError("Password must be at least 10 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain a lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain a digit")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str
    totp_code: str


class VerifySetupRequest(BaseModel):
    totp_code: str


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    user = db.query(User).first()
    return {"setup_complete": user is not None}


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account already exists")

    totp_secret = generate_totp_secret()
    user = User(
        username=req.username,
        hashed_password=hash_password(req.password),
        totp_secret=totp_secret,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    uri = get_totp_uri(totp_secret, req.username)
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    qr_svg = buf.getvalue().decode("utf-8")

    return {"totp_secret": totp_secret, "qr_svg": qr_svg, "user_id": user.id}


@router.post("/verify-setup")
def verify_setup(req: VerifySetupRequest, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=400, detail="No account found")
    if not verify_totp(user.totp_secret, req.totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    token = create_access_token({"sub": str(user.id)})
    return {"message": "Setup complete", "token": token}


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_totp(user.totp_secret, req.totp_code):
        raise HTTPException(status_code=401, detail="Invalid 2FA code")

    token = create_access_token({"sub": str(user.id)})
    return {"message": "Login successful", "token": token}


@router.post("/logout")
def logout():
    return {"message": "Logged out"}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username}
