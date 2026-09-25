import json
import os
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
    event,
    or_,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, declarative_base, sessionmaker


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mindvoid.db")


def is_sqlite_database_url(database_url: str) -> bool:
    return database_url.startswith("sqlite:")


def create_database_engine(database_url: str = SQLALCHEMY_DATABASE_URL, **kwargs):
    if is_sqlite_database_url(database_url):
        kwargs.setdefault("connect_args", {"check_same_thread": False})
    db_engine = create_engine(database_url, **kwargs)

    if is_sqlite_database_url(database_url):
        @event.listens_for(db_engine, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return db_engine


engine = create_database_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ThoughtModel(Base):
    __tablename__ = "thoughts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=True)
    content = Column(String(10000), nullable=False)
    x_pos = Column(Float, default=0.0)
    y_pos = Column(Float, default=0.0)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    needs_action = Column(Boolean, default=False)
    is_group = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class LinkModel(Base):
    __tablename__ = "links"
    __table_args__ = (UniqueConstraint("source_id", "target_id", name="uq_links_source_target"),)

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("thoughts.id", ondelete="CASCADE"), nullable=False)
    target_id = Column(Integer, ForeignKey("thoughts.id", ondelete="CASCADE"), nullable=False)


class DrawingModel(Base):
    __tablename__ = "drawings"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    x = Column(Float, default=0.0)
    y = Column(Float, default=0.0)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    points = Column(String(100000), nullable=True)
    text = Column(String(2000), nullable=True)
    color = Column(String, default="#64748b")
    stroke_width = Column(Float, default=2.0)
    created_at = Column(DateTime(timezone=True), default=utc_now)


Base.metadata.create_all(bind=engine)


class TimestampMixin(BaseModel):
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @field_serializer("created_at")
    def serialize_created_at(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()


class ThoughtBase(BaseModel):
    content: str = Field(max_length=10000)
    title: Optional[str] = Field(default=None, max_length=200)
    x_pos: float = 0.0
    y_pos: float = 0.0
    width: Optional[float] = None
    height: Optional[float] = None
    needs_action: bool = False
    is_group: bool = False
    is_locked: bool = False

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be empty")
        return value


class ThoughtUpdate(BaseModel):
    content: Optional[str] = Field(default=None, max_length=10000)
    title: Optional[str] = Field(default=None, max_length=200)
    x_pos: Optional[float] = None
    y_pos: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    needs_action: Optional[bool] = None
    is_group: Optional[bool] = None
    is_locked: Optional[bool] = None

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("content must not be empty")
        return value


class Thought(ThoughtBase, TimestampMixin):
    id: int

    model_config = ConfigDict(from_attributes=True)


class LinkBase(BaseModel):
    source_id: int
    target_id: int


class Link(LinkBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


DrawingType = Literal["rectangle", "circle", "triangle", "line", "arrow", "text", "freehand"]
HEX_COLOR_PATTERN = r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"


class DrawingBase(BaseModel):
    type: DrawingType
    x: float = 0.0
    y: float = 0.0
    width: Optional[float] = None
    height: Optional[float] = None
    points: Optional[str] = Field(default=None, max_length=100000)
    text: Optional[str] = Field(default=None, max_length=2000)
    color: str = Field(default="#64748b", pattern=HEX_COLOR_PATTERN)
    stroke_width: float = 2.0

    @field_validator("points")
    @classmethod
    def points_must_be_json(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            try:
                json.loads(value)
            except json.JSONDecodeError as exc:
                raise ValueError("points must be valid JSON") from exc
        return value


class DrawingUpdate(BaseModel):
    type: Optional[DrawingType] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    points: Optional[str] = Field(default=None, max_length=100000)
    text: Optional[str] = Field(default=None, max_length=2000)
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR_PATTERN)
    stroke_width: Optional[float] = None

    @field_validator("points")
    @classmethod
    def points_must_be_json(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            try:
                json.loads(value)
            except json.JSONDecodeError as exc:
                raise ValueError("points must be valid JSON") from exc
        return value


class Drawing(DrawingBase, TimestampMixin):
    id: int

    model_config = ConfigDict(from_attributes=True)


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return ["http://localhost:3003", "http://127.0.0.1:3003"]


app = FastAPI()

cors_origins = get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.post("/thoughts/", response_model=Thought)
def create_thought(thought: ThoughtBase, db: Session = Depends(get_db)):
    db_thought = ThoughtModel(**thought.model_dump())
    db.add(db_thought)
    db.commit()
    db.refresh(db_thought)
    return db_thought


@app.get("/thoughts/", response_model=List[Thought])
def read_thoughts(db: Session = Depends(get_db)):
    return db.query(ThoughtModel).all()


@app.put("/thoughts/{thought_id}", response_model=Thought)
def update_thought(thought_id: int, thought_update: ThoughtUpdate, db: Session = Depends(get_db)):
    db_thought = db.query(ThoughtModel).filter(ThoughtModel.id == thought_id).first()
    if not db_thought:
        raise HTTPException(status_code=404, detail="Thought not found")

    update_data = thought_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_thought, key, value)

    db.commit()
    db.refresh(db_thought)
    return db_thought


@app.delete("/thoughts/{thought_id}")
def delete_thought(thought_id: int, db: Session = Depends(get_db)):
    db_thought = db.query(ThoughtModel).filter(ThoughtModel.id == thought_id).first()
    if not db_thought:
        raise HTTPException(status_code=404, detail="Thought not found")

    db.query(LinkModel).filter(
        (LinkModel.source_id == thought_id) | (LinkModel.target_id == thought_id)
    ).delete()

    db.delete(db_thought)
    db.commit()
    return {"message": "Thought deleted successfully"}


@app.post("/links/", response_model=Link)
def create_link(link: LinkBase, db: Session = Depends(get_db)):
    if link.source_id == link.target_id:
        raise HTTPException(status_code=400, detail="Cannot link a thought to itself")

    thoughts = db.query(ThoughtModel.id).filter(ThoughtModel.id.in_([link.source_id, link.target_id])).all()
    if {thought.id for thought in thoughts} != {link.source_id, link.target_id}:
        raise HTTPException(status_code=404, detail="Thought not found")

    existing_link = db.query(LinkModel).filter(
        or_(
            (LinkModel.source_id == link.source_id) & (LinkModel.target_id == link.target_id),
            (LinkModel.source_id == link.target_id) & (LinkModel.target_id == link.source_id),
        )
    ).first()
    if existing_link:
        return existing_link

    db_link = LinkModel(**link.model_dump())
    db.add(db_link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_link = db.query(LinkModel).filter(
            (LinkModel.source_id == link.source_id) & (LinkModel.target_id == link.target_id)
        ).first()
        if existing_link:
            return existing_link
        raise
    db.refresh(db_link)
    return db_link


@app.get("/links/", response_model=List[Link])
def read_links(db: Session = Depends(get_db)):
    return db.query(LinkModel).all()


@app.delete("/links/{link_id}")
def delete_link(link_id: int, db: Session = Depends(get_db)):
    db_link = db.query(LinkModel).filter(LinkModel.id == link_id).first()
    if not db_link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(db_link)
    db.commit()
    return {"message": "Link deleted successfully"}


@app.post("/drawings/", response_model=Drawing)
def create_drawing(drawing: DrawingBase, db: Session = Depends(get_db)):
    db_drawing = DrawingModel(**drawing.model_dump())
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    return db_drawing


@app.get("/drawings/", response_model=List[Drawing])
def read_drawings(db: Session = Depends(get_db)):
    return db.query(DrawingModel).all()


@app.put("/drawings/{drawing_id}", response_model=Drawing)
def update_drawing(drawing_id: int, drawing_update: DrawingUpdate, db: Session = Depends(get_db)):
    db_drawing = db.query(DrawingModel).filter(DrawingModel.id == drawing_id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    update_data = drawing_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_drawing, key, value)

    db.commit()
    db.refresh(db_drawing)
    return db_drawing


@app.delete("/drawings/{drawing_id}")
def delete_drawing(drawing_id: int, db: Session = Depends(get_db)):
    db_drawing = db.query(DrawingModel).filter(DrawingModel.id == drawing_id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    db.delete(db_drawing)
    db.commit()
    return {"message": "Drawing deleted successfully"}
