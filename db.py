from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from tenacity import retry, wait_fixed, stop_after_attempt
import os

# Исправленное подключение к базе данных
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://user:password@db:5432/messenger"  # Изменено: messenger вместо user
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@retry(wait=wait_fixed(2), stop=stop_after_attempt(10))
def init_db():
    try:
        from app import models
        models.Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
    except Exception as e:
        print(f"❌ Failed to create tables: {e}")
        raise