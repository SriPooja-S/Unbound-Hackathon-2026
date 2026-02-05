# server/database.py
from typing import Optional, List
from sqlmodel import Field, SQLModel, create_engine, Relationship, Session

# Define the database file location
DATABASE_URL = "sqlite:///./workflow.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# --- MODELS ---

class Workflow(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    status: str = Field(default="pending")  # pending, running, completed, failed
    created_at: str

    # Relationship: One Workflow has many Steps
    steps: List["Step"] = Relationship(back_populates="workflow")

class Step(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    workflow_id: int = Field(foreign_key="workflow.id")
    
    order: int                  # 1, 2, 3...
    model: str                  # "kimi-k2p5"
    prompt_template: str        # "Write a python script about {previous_context}"
    completion_criteria: str    # "CONTAINS:success" or "REGEX:\d+"
    
    # Execution State
    status: str = Field(default="pending") # pending, running, completed, failed
    input_context: Optional[str] = None    # What was fed into this step
    output_content: Optional[str] = None   # What the LLM replied
    error_log: Optional[str] = None        # If it failed, why?

    # Relationship: Step belongs to a Workflow
    workflow: Optional[Workflow] = Relationship(back_populates="steps")

# --- DATABASE SETUP ---

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session