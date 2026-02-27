from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./mindvoid.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLAlchemy Models
class ThoughtModel(Base):
    __tablename__ = "thoughts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=True)
    content = Column(String, nullable=False)
    x_pos = Column(Float, default=0.0)
    y_pos = Column(Float, default=0.0)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    needs_action = Column(Boolean, default=False)
    is_group = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class LinkModel(Base):
    __tablename__ = "links"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("thoughts.id"))
    target_id = Column(Integer, ForeignKey("thoughts.id"))

class DrawingModel(Base):
    __tablename__ = "drawings"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)  # 'rectangle', 'circle', 'triangle', 'line', 'arrow', 'text', 'freehand'
    x = Column(Float, default=0.0)
    y = Column(Float, default=0.0)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    points = Column(String, nullable=True)  # JSON string for freehand or multi-point shapes
    text = Column(String, nullable=True)
    color = Column(String, default="#64748b")
    stroke_width = Column(Float, default=2.0)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

# Pydantic Schemas
class ThoughtBase(BaseModel):
    content: str
    title: Optional[str] = None
    x_pos: float = 0.0
    y_pos: float = 0.0
    width: Optional[float] = None
    height: Optional[float] = None
    needs_action: bool = False
    is_group: bool = False
    is_locked: bool = False

class ThoughtUpdate(BaseModel):
    content: Optional[str] = None
    title: Optional[str] = None
    x_pos: Optional[float] = None
    y_pos: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    needs_action: Optional[bool] = None
    is_group: Optional[bool] = None
    is_locked: Optional[bool] = None

class Thought(ThoughtBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class LinkBase(BaseModel):
    source_id: int
    target_id: int

class Link(LinkBase):
    id: int

    class Config:
        from_attributes = True

class DrawingBase(BaseModel):
    type: str
    x: float = 0.0
    y: float = 0.0
    width: Optional[float] = None
    height: Optional[float] = None
    points: Optional[str] = None
    text: Optional[str] = None
    color: str = "#64748b"
    stroke_width: float = 2.0

class DrawingUpdate(BaseModel):
    type: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    points: Optional[str] = None
    text: Optional[str] = None
    color: Optional[str] = None
    stroke_width: Optional[float] = None

class Drawing(DrawingBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# FastAPI app
app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Thought Endpoints
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
    
    # Delete associated links
    db.query(LinkModel).filter(
        (LinkModel.source_id == thought_id) | (LinkModel.target_id == thought_id)
    ).delete()
    
    db.delete(db_thought)
    db.commit()
    return {"message": "Thought deleted successfully"}

# Link Endpoints
@app.post("/links/", response_model=Link)
def create_link(link: LinkBase, db: Session = Depends(get_db)):
    db_link = LinkModel(**link.model_dump())
    db.add(db_link)
    db.commit()
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

# Drawing Endpoints
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
