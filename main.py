from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
import bcrypt
import os
import sys

# Добавляем текущую директорию в PYTHONPATH
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import models
from app.routes import chat
from app.metrics import setup_metrics
from db import get_db, init_db  # Изменено: импортируем из db, а не app.db

app = FastAPI()

# Инициализация БД
try:
    init_db()
    print("✅ Database initialized successfully")
except Exception as e:
    print(f"❌ Database initialization error: {e}")

# Подключаем роутеры
app.include_router(chat.router)

# Настраиваем метрики
setup_metrics(app)


class UserCreate(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


@app.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(
        models.User.username == user.username
    ).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Пользователь уже существует")

    password_hash = bcrypt.hashpw(
        user.password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

    new_user = models.User(
        username=user.username,
        password_hash=password_hash
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "Регистрация успешна", "user_id": new_user.id}


@app.post("/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(
        models.User.username == user.username
    ).first()

    if not db_user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if not bcrypt.checkpw(
        user.password.encode('utf-8'),
        db_user.password_hash.encode('utf-8')
    ):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    db_user.last_seen = datetime.utcnow()
    db.commit()

    return {
        "message": "Вход успешен",
        "user_id": db_user.id,
        "username": db_user.username
    }


@app.get("/")
async def index():
    return FileResponse("app/static/index.html")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Статические файлы
app.mount("/static", StaticFiles(directory="app/static"), name="static")