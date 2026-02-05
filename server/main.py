# server/main.py
import traceback
import requests
import time
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
import socketio
import os
import asyncio
from dotenv import load_dotenv

from database import Workflow, Step, create_db_and_tables, get_session

# Load keys
load_dotenv()
UNBOUND_API_URL = os.getenv("UNBOUND_API_URL")
UNBOUND_API_KEY = os.getenv("UNBOUND_API_KEY")

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
api_app = FastAPI()

api_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api_app.on_event("startup")
def on_startup():
    create_db_and_tables()

# --- DATA SCHEMAS ---
class StepRead(BaseModel):
    id: int
    order: int
    model: str
    prompt_template: str
    completion_criteria: str
    status: str
    input_context: Optional[str] = None
    output_content: Optional[str] = None
    error_log: Optional[str] = None

class StepCreate(BaseModel):
    order: int
    model: str
    prompt_template: str
    completion_criteria: str

class WorkflowRead(BaseModel):
    id: int
    name: str
    status: str
    created_at: str
    steps: List[StepRead] = []

class WorkflowCreate(BaseModel):
    name: str
    steps: List[StepCreate]

# --- LOGIC ---
def check_completion(criteria: str, output: str) -> bool:
    if not criteria or criteria == "always_pass": return True
    if criteria == "CODE_BLOCK": return "```" in output
    if criteria.startswith("CONTAINS:"):
        return criteria.split("CONTAINS:")[1].lower() in output.lower()
    return True

# --- CORE EXECUTION LOGIC ---
async def execute_workflow_logic(workflow_id: int, session: Session):
    print(f"\n--- 🚀 STARTING WORKFLOW {workflow_id} ---")
    statement = select(Workflow).where(Workflow.id == workflow_id).options(selectinload(Workflow.steps))
    workflow = session.exec(statement).first()
    if not workflow: return
    
    workflow.status = "running"
    session.add(workflow)
    session.commit()
    await sio.emit('workflow_update', {'id': workflow.id, 'status': 'running'})

    current_context = "" 
    steps = sorted(workflow.steps, key=lambda s: s.order)

    for step in steps:
        print(f"--- STEP {step.order} ---")
        step.status = "running"
        session.add(step)
        session.commit()
        await sio.emit('step_update', {'id': step.id, 'status': 'running', 'output': '⏳ Sending request to AI...'})

        # Context Logic
        if step.order > 1 and not current_context:
            current_context = "No context provided."
        
        final_prompt = step.prompt_template.replace("{previous_context}", current_context)
        
        # --- ROBUST RETRY LOOP (Real API Calls Only) ---
        max_retries = 3
        attempt = 0
        success = False
        ai_output = ""
        error_msg = ""

        while attempt < max_retries and not success:
            attempt += 1
            try:
                headers = {
                    "Authorization": f"Bearer {UNBOUND_API_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": step.model,
                    "messages": [{"role": "user", "content": final_prompt}]
                }

                print(f"Attempt {attempt}: Calling API...")
                
                # CRITICAL FIX: Using run_in_executor to make synchronous 'requests' async-compatible
                # This prevents the ReadError/RemoteDisconnected issues common with httpx
                loop = asyncio.get_running_loop()
                response = await loop.run_in_executor(
                    None, 
                    lambda: requests.post(UNBOUND_API_URL, json=payload, headers=headers, timeout=60)
                )
                
                if response.status_code == 200:
                    data = response.json()
                    ai_output = data['choices'][0]['message']['content']
                    
                    if check_completion(step.completion_criteria, ai_output):
                        success = True
                    else:
                        error_msg = f"Criteria '{step.completion_criteria}' failed."
                        print(f"⚠️ {error_msg}")
                        await sio.emit('step_update', {'id': step.id, 'status': 'running', 'output': f"Attempt {attempt} Failed: {error_msg}\nRetrying..."})
                else:
                    raise Exception(f"API Error {response.status_code}: {response.text}")

            except Exception as e:
                error_msg = str(e)
                print(f"⚠️ API Exception: {error_msg}")
                await sio.emit('step_update', {'id': step.id, 'status': 'running', 'output': f"Attempt {attempt} Error: {error_msg}\nRetrying..."})
                await asyncio.sleep(2) # Wait 2s before retry

        if not success:
            print("❌ STEP FAILED")
            step.status = "failed"
            step.output_content = ai_output
            step.error_log = error_msg
            workflow.status = "failed"
            session.add(step)
            session.add(workflow)
            session.commit()
            await sio.emit('step_update', {'id': step.id, 'status': 'failed', 'error': error_msg, 'output': ai_output})
            await sio.emit('workflow_update', {'id': workflow.id, 'status': 'failed'})
            return 

        print("✅ STEP SUCCESS")
        step.output_content = ai_output
        step.status = "completed"
        current_context = ai_output 
        session.add(step)
        session.commit()
        await sio.emit('step_update', {'id': step.id, 'status': 'completed', 'output': ai_output})
        await asyncio.sleep(1)

    print("🏁 WORKFLOW COMPLETED")
    workflow.status = "completed"
    session.add(workflow)
    session.commit()
    await sio.emit('workflow_update', {'id': workflow.id, 'status': 'completed'})

# --- ROUTES ---

@api_app.post("/workflows/", response_model=WorkflowRead)
def create_workflow(workflow_data: WorkflowCreate, session: Session = Depends(get_session)):
    new_workflow = Workflow(name=workflow_data.name, created_at="Now")
    session.add(new_workflow)
    session.commit()
    session.refresh(new_workflow)
    for step_data in workflow_data.steps:
        new_step = Step(workflow_id=new_workflow.id, order=step_data.order, model=step_data.model, prompt_template=step_data.prompt_template, completion_criteria=step_data.completion_criteria)
        session.add(new_step)
    session.commit()
    statement = select(Workflow).where(Workflow.id == new_workflow.id).options(selectinload(Workflow.steps))
    return session.exec(statement).first()

@api_app.put("/workflows/{workflow_id}", response_model=WorkflowRead)
def update_workflow(workflow_id: int, workflow_data: WorkflowCreate, session: Session = Depends(get_session)):
    workflow = session.get(Workflow, workflow_id)
    if not workflow: raise HTTPException(status_code=404, detail="Workflow not found")
    workflow.name = workflow_data.name
    workflow.status = "pending"
    session.add(workflow)
    for step in workflow.steps: session.delete(step)
    for step_data in workflow_data.steps:
        new_step = Step(workflow_id=workflow.id, order=step_data.order, model=step_data.model, prompt_template=step_data.prompt_template, completion_criteria=step_data.completion_criteria)
        session.add(new_step)
    session.commit()
    statement = select(Workflow).where(Workflow.id == workflow_id).options(selectinload(Workflow.steps))
    return session.exec(statement).first()

@api_app.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: int, session: Session = Depends(get_session)):
    workflow = session.get(Workflow, workflow_id)
    if not workflow: raise HTTPException(status_code=404, detail="Workflow not found")
    for step in workflow.steps: session.delete(step)
    session.delete(workflow)
    session.commit()
    return {"ok": True}

@api_app.get("/workflows/", response_model=List[WorkflowRead])
def get_workflows(session: Session = Depends(get_session)):
    statement = select(Workflow).options(selectinload(Workflow.steps))
    return session.exec(statement).all()

@api_app.post("/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: int, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    background_tasks.add_task(execute_workflow_logic, workflow_id, session)
    return {"status": "started", "workflow_id": workflow_id}

app = socketio.ASGIApp(sio, api_app)