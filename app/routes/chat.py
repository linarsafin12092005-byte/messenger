from fastapi import WebSocket, WebSocketDisconnect, APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict
from datetime import datetime
import asyncio
import logging
from app import models
from db import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.users: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, username: str):
        # НЕ вызываем websocket.accept() здесь, так как он уже вызван
        self.active_connections[username] = websocket
        self.users[str(websocket)] = username

        logger.info(f"✅ User {username} connected. Total: {len(self.active_connections)}")

        # Оповещаем всех о новом пользователе
        await self.broadcast({
            "type": "system",
            "text": f"{username} присоединился к чату"
        })
        await self.broadcast_users_list()

    def disconnect(self, websocket: WebSocket):
        username = self.users.get(str(websocket))
        if username:
            del self.active_connections[username]
            del self.users[str(websocket)]
            logger.info(f"❌ User {username} disconnected. Total: {len(self.active_connections)}")

            # Оповещаем всех о выходе пользователя
            asyncio.create_task(self.broadcast({
                "type": "system",
                "text": f"{username} покинул чат"
            }))
            asyncio.create_task(self.broadcast_users_list())

    async def broadcast(self, message: dict):
        to_remove = []
        for username, connection in self.active_connections.items():
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to {username}: {e}")
                to_remove.append(username)

        # Удаляем неработающие соединения
        for username in to_remove:
            if username in self.active_connections:
                del self.active_connections[username]

    async def broadcast_users_list(self):
        users_list = list(self.active_connections.keys())
        await self.broadcast({
            "type": "users_list",
            "users": users_list
        })


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Принимаем соединение ТОЛЬКО здесь, один раз
    await websocket.accept()
    logger.info("New WebSocket connection accepted")
    
    username = None
    user_id = None
    db_generator = None

    try:
        # Получаем сообщение с авторизацией
        data = await websocket.receive_json()
        logger.info(f"Received auth data: {data}")

        if data.get("type") != "auth":
            logger.warning("Auth required")
            await websocket.close(code=4000, reason="Auth required")
            return

        username = data.get("username")
        if not username:
            logger.warning("No username provided")
            await websocket.close(code=4000, reason="No username")
            return

        logger.info(f"Authenticating user: {username}")

        # Получаем сессию БД
        db_generator = get_db()
        db = next(db_generator)

        user = db.query(models.User).filter(
            models.User.username == username
        ).first()

        if not user:
            logger.warning(f"User not found: {username}")
            await websocket.close(code=4000, reason="User not found")
            return

        user_id = user.id
        logger.info(f"User authenticated: {username} (id: {user_id})")
        
        # Подключаем пользователя (без повторного accept)
        await manager.connect(websocket, username)

        # Отправляем последние 50 сообщений
        messages = db.query(models.Message).order_by(
            models.Message.created_at.desc()
        ).limit(50).all()

        logger.info(f"Sending {len(messages)} historical messages to {username}")
        
        for msg in reversed(messages):
            await websocket.send_json({
                "type": "message",
                "username": msg.username,
                "text": msg.text,
                "created_at": msg.created_at.isoformat()
            })

        # Основной цикл получения сообщений
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") != "message":
                continue

            text = data.get("text", "")
            if not text:
                continue

            logger.info(f"New message from {username}: {text[:50]}...")

            # Получаем новую сессию для каждого сообщения
            if db_generator:
                db_generator.close()

            db_generator = get_db()
            db = next(db_generator)

            new_message = models.Message(
                user_id=user_id,
                username=username,
                text=text
            )
            db.add(new_message)
            db.commit()

            # Рассылаем всем
            await manager.broadcast({
                "type": "message",
                "username": username,
                "text": text,
                "created_at": datetime.utcnow().isoformat()
            })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user: {username}")
        if username:
            manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        if username:
            manager.disconnect(websocket)
    finally:
        if db_generator:
            db_generator.close()