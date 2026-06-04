from sqlalchemy import Boolean, create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey, JSON 
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime
import os

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
# Строка подключения к PostgreSQL в Docker
# SQLALCHEMY_DATABASE_URL = "postgresql://user:password@localhost:5432/ai_detector"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=30,           # Базовое количество подключений (хватит на всех)
    max_overflow=50,        # Сколько можно создать сверх базы при нагрузке
    pool_timeout=30,        # Время ожидания
    pool_pre_ping=True      # ВАЖНО: автоматически переподключаться при обрыве связи с Railway БД
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- МОДЕЛЬ ПОЛЬЗОВАТЕЛЯ ---
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user")

    settings = relationship("CheckSettings", back_populates="owner", uselist=False)
    results = relationship("DetectionResult", back_populates="owner")

# --- МОДЕЛЬ РЕЗУЛЬТАТОВ ---
class DetectionResult(Base):
    __tablename__ = "results"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=True) # НОВОЕ ПОЛЕ
    text_content = Column(Text)
    html_content = Column(Text, nullable=True)
    label = Column(String)
    score = Column(Float)
    page_count = Column(Integer, default=0)
    format_errors = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="results")
    user_feedback = Column(Boolean, nullable=True)
    version = Column(Integer, default=1)
    
    training_samples = relationship("TrainingData", back_populates="result", cascade="all, delete-orphan")


class TrainingData(Base):
    __tablename__ = "training_data"
    id = Column(Integer, primary_key=True, index=True)
    result_id = Column(Integer, ForeignKey("results.id", ondelete="CASCADE"), nullable=True)
    text_content = Column(Text)
    label = Column(Integer) # 1 - AI, 0 - Human
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    result = relationship("DetectionResult", back_populates="training_samples")

class CheckSettings(Base):
    __tablename__ = "check_settings"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), unique=True)
    
    # Технические параметры (по методичке)
    font_name = Column(String, default="Times New Roman")
    font_size = Column(Integer, default=12) # размер шрифта
    margin_left = Column(Float, default=2.0)   # в см
    margin_right = Column(Float, default=2.0)  # в см
    margin_top = Column(Float, default=2.5)    # в см
    margin_bottom = Column(Float, default=2.5) # в см
    indent = Column(Float, default=0.5)        # абзацный отступ
    min_references = Column(Integer, default=3) # минимум источников

    # Умные проверки (NLP)
    check_translation = Column(Boolean, default=True)
    check_abstract = Column(Boolean, default=True)

    # Глобальные тумблеры инструментов
    ai_enabled = Column(Boolean, default=True)
    norm_enabled = Column(Boolean, default=True)
    feedback_enabled = Column(Boolean, default=True) # Тумблер режима обучения
    check_apak = Column(Boolean, default=True)

    owner = relationship("User")

class UserFeedback(Base):
    __tablename__ = "user_feedback"
    id = Column(Integer, primary_key=True, index=True)
    result_id = Column(Integer, ForeignKey("results.id"))
    user_choice = Column(String)  # "yes", "no", "idk"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

# Функция инициализации (создание таблиц)
def init_db():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()