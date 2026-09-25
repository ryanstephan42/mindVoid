import base64
import binascii
import hashlib
import hmac
import json
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
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
    inspect,
    or_,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, declarative_base, sessionmaker


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


logger = logging.getLogger(__name__)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mindvoid.db")
AUTH_DISABLED_WARNING = "MindVoid auth is disabled because MINDVOID_PASSWORD is unset or empty."
AUTH_KEY_WARNING = "Token signing key is unset; generated a random key, so tokens will not survive a restart."
_GENERATED_AUTH_SECRET = secrets.token_urlsafe(32)


def get_auth_password() -> Optional[str]:
    password = os.getenv("MINDVOID_PASSWORD")
    if not password:
        return None
    return password


def is_auth_required() -> bool:
    return get_auth_password() is not None


def get_auth_secret() -> str:
    return os.getenv("MINDVOID_SECRET") or _GENERATED_AUTH_SECRET


def get_token_ttl_hours() -> int:
    configured = os.getenv("MINDVOID_TOKEN_TTL_HOURS")
    if configured:
        try:
            return int(configured)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="Invalid MINDVOID_TOKEN_TTL_HOURS") from exc
    return 720


def encode_token_part(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def get_token_signing_key() -> bytes:
    # Derive the signing key from both the secret and the current password so that
    # changing MINDVOID_PASSWORD immediately invalidates every existing session.
    password = get_auth_password() or ""
    return hashlib.sha256(f"{get_auth_secret()}:{password}".encode("utf-8")).digest()


def password_digest(value: str) -> bytes:
    # Hash before comparing so compare_digest never sees non-ASCII str input.
    return hashlib.sha256(value.encode("utf-8")).digest()


def decode_token_part(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_auth_token(expires_at: datetime) -> str:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    payload = json.dumps(
        {"exp": int(expires_at.timestamp())},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    signature = hmac.new(get_token_signing_key(), payload, hashlib.sha256).digest()
    return f"{encode_token_part(payload)}.{encode_token_part(signature)}"


def verify_auth_token(token: str) -> bool:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        payload = decode_token_part(encoded_payload)
        signature = decode_token_part(encoded_signature)
    except (ValueError, TypeError, binascii.Error):
        return False

    expected_signature = hmac.new(get_token_signing_key(), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected_signature):
        return False

    try:
        token_data = json.loads(payload.decode("utf-8"))
        expires_at = datetime.fromtimestamp(token_data["exp"], timezone.utc)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError, OSError):
        return False

    return utc_now() <= expires_at


def require_auth(authorization: Optional[str] = Header(default=None)):
    if not is_auth_required():
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise_auth_error()
    token = authorization.removeprefix("Bearer ").strip()
    if not token or not verify_auth_token(token):
        raise_auth_error()


def raise_auth_error():
    raise HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


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
    last_seen_at = Column(DateTime(timezone=True), nullable=True)


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


def ensure_schema(db_engine):
    inspector = inspect(db_engine)
    if not inspector.has_table("thoughts"):
        return
    thought_columns = {column["name"] for column in inspector.get_columns("thoughts")}
    if "last_seen_at" not in thought_columns:
        with db_engine.begin() as connection:
            connection.exec_driver_sql("ALTER TABLE thoughts ADD COLUMN last_seen_at DATETIME")


Base.metadata.create_all(bind=engine)
ensure_schema(engine)


class TimestampMixin(BaseModel):
    created_at: datetime

    @field_validator("created_at", "last_seen_at", check_fields=False)
    @classmethod
    def ensure_timezone(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @field_serializer("created_at", "last_seen_at", check_fields=False)
    def serialize_timestamp(self, value: Optional[datetime]) -> Optional[str]:
        if value is None:
            return None
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
    last_seen_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LinkBase(BaseModel):
    source_id: int
    target_id: int


class Link(LinkBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str
    expires_at: datetime

    @field_serializer("expires_at")
    def serialize_expires_at(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()


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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not is_auth_required():
        logger.warning(AUTH_DISABLED_WARNING)
    if not os.getenv("MINDVOID_SECRET"):
        logger.warning(AUTH_KEY_WARNING)
    yield


app = FastAPI(lifespan=lifespan)

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


@app.get("/auth/status")
def auth_status():
    return {"auth_required": is_auth_required()}


@app.post("/auth/login", response_model=LoginResponse)
def auth_login(login: LoginRequest):
    configured_password = get_auth_password()
    if configured_password is None:
        raise HTTPException(status_code=400, detail="Auth is disabled because MINDVOID_PASSWORD is unset or empty")
    if not hmac.compare_digest(password_digest(login.password), password_digest(configured_password)):
        raise HTTPException(status_code=401, detail="Invalid password")

    expires_at = utc_now() + timedelta(hours=get_token_ttl_hours())
    return {"token": create_auth_token(expires_at), "expires_at": expires_at}


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.post("/thoughts/", response_model=Thought, dependencies=[Depends(require_auth)])
def create_thought(thought: ThoughtBase, db: Session = Depends(get_db)):
    db_thought = ThoughtModel(**thought.model_dump())
    db.add(db_thought)
    db.commit()
    db.refresh(db_thought)
    return db_thought


@app.get("/thoughts/", response_model=List[Thought], dependencies=[Depends(require_auth)])
def read_thoughts(
    q: Optional[str] = None,
    needs_action: Optional[bool] = None,
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(ThoughtModel)
    if q is not None:
        pattern = f"%{escape_like(q)}%"
        query = query.filter(
            or_(
                ThoughtModel.title.ilike(pattern, escape="\\"),
                ThoughtModel.content.ilike(pattern, escape="\\"),
            )
        )
    if needs_action is not None:
        query = query.filter(ThoughtModel.needs_action == needs_action)
    if created_after is not None:
        query = query.filter(ThoughtModel.created_at >= created_after)
    if created_before is not None:
        query = query.filter(ThoughtModel.created_at <= created_before)
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


@app.get("/thoughts/resurface", response_model=List[Thought], dependencies=[Depends(require_auth)])
def resurface_thoughts(limit: int = Query(default=5, ge=1, le=50), db: Session = Depends(get_db)):
    candidate_limit = min(max(limit * 20, 100), 1000)
    candidates = (
        db.query(ThoughtModel)
        .order_by(ThoughtModel.last_seen_at.asc().nullsfirst(), ThoughtModel.created_at.asc())
        .limit(candidate_limit)
        .all()
    )
    if not candidates:
        return []

    candidate_ids = [thought.id for thought in candidates]
    linked_rows = db.query(LinkModel.source_id, LinkModel.target_id).filter(
        (LinkModel.source_id.in_(candidate_ids)) | (LinkModel.target_id.in_(candidate_ids))
    )
    linked_thought_ids = {thought_id for row in linked_rows for thought_id in row if thought_id in candidate_ids}

    def sortable_timestamp(value: Optional[datetime]) -> datetime:
        if value is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    def resurface_key(thought: ThoughtModel):
        extra_weight = 0
        if thought.id not in linked_thought_ids:
            extra_weight += 1
        if not thought.title:
            extra_weight += 1
        if thought.needs_action:
            extra_weight += 1
        seen_at = sortable_timestamp(thought.last_seen_at)
        created_at = sortable_timestamp(thought.created_at)
        return (seen_at, -extra_weight, created_at)

    return sorted(candidates, key=resurface_key)[:limit]


@app.post("/thoughts/{thought_id}/seen", response_model=Thought, dependencies=[Depends(require_auth)])
def mark_thought_seen(thought_id: int, db: Session = Depends(get_db)):
    db_thought = db.query(ThoughtModel).filter(ThoughtModel.id == thought_id).first()
    if not db_thought:
        raise HTTPException(status_code=404, detail="Thought not found")
    db_thought.last_seen_at = utc_now()
    db.commit()
    db.refresh(db_thought)
    return db_thought


@app.put("/thoughts/{thought_id}", response_model=Thought, dependencies=[Depends(require_auth)])
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


@app.delete("/thoughts/{thought_id}", dependencies=[Depends(require_auth)])
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


@app.post("/links/", response_model=Link, dependencies=[Depends(require_auth)])
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


@app.get("/links/", response_model=List[Link], dependencies=[Depends(require_auth)])
def read_links(db: Session = Depends(get_db)):
    return db.query(LinkModel).all()


@app.delete("/links/{link_id}", dependencies=[Depends(require_auth)])
def delete_link(link_id: int, db: Session = Depends(get_db)):
    db_link = db.query(LinkModel).filter(LinkModel.id == link_id).first()
    if not db_link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(db_link)
    db.commit()
    return {"message": "Link deleted successfully"}


@app.post("/drawings/", response_model=Drawing, dependencies=[Depends(require_auth)])
def create_drawing(drawing: DrawingBase, db: Session = Depends(get_db)):
    db_drawing = DrawingModel(**drawing.model_dump())
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    return db_drawing


@app.get("/drawings/", response_model=List[Drawing], dependencies=[Depends(require_auth)])
def read_drawings(db: Session = Depends(get_db)):
    return db.query(DrawingModel).all()


@app.put("/drawings/{drawing_id}", response_model=Drawing, dependencies=[Depends(require_auth)])
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


@app.delete("/drawings/{drawing_id}", dependencies=[Depends(require_auth)])
def delete_drawing(drawing_id: int, db: Session = Depends(get_db)):
    db_drawing = db.query(DrawingModel).filter(DrawingModel.id == drawing_id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    db.delete(db_drawing)
    db.commit()
    return {"message": "Drawing deleted successfully"}
