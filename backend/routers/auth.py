from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User
from rate_limit import limiter
from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID
import bcrypt
from jose import jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

MIN_PASSWORD_LENGTH = 8

# Placeholder and disposable domains. EmailStr already rejects malformed
# addresses; these are addresses that parse but will never receive mail.
BLOCKED_EMAIL_DOMAINS = {
    "example.com", "example.net", "example.org", "test.com", "test.net",
    "email.com", "domain.com", "fake.com", "invalid.com", "nowhere.com",
    "mailinator.com", "yopmail.com", "guerrillamail.com", "sharklasers.com",
    "10minutemail.com", "tempmail.com", "temp-mail.org", "throwaway.email",
    "trashmail.com", "dispostable.com", "fakeinbox.com", "getnada.com",
    "maildrop.cc",
}


class SignupRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def reject_placeholder_domains(cls, value: str) -> str:
        domain = value.rsplit("@", 1)[1].lower()
        if domain in BLOCKED_EMAIL_DOMAINS:
            raise ValueError("Enter an email address you can receive mail at")
        return value.lower()

    @field_validator("password")
    @classmethod
    def check_password_length(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
            )
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def create_token(user_id: UUID):
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/signup")
@limiter.limit("5/minute")
def signup(request: Request, req: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    user = User(email=req.email, password_hash=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user.id)}


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not bcrypt.checkpw(req.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token(user.id)}
