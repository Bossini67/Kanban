import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from postgrest.exceptions import APIError
from supabase import Client, create_client

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))
logger = logging.getLogger(__name__)


def create_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
    return create_client(url, key)


supabase = create_supabase_client()

origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app = FastAPI(title="Kanban Board API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


CardStatus = Literal["todo", "doing", "done"]


class Card(BaseModel):
    id: int
    title: str
    status: CardStatus
    created_at: datetime


class CardCreate(BaseModel):
    title: str = Field(min_length=1)


class CardUpdate(BaseModel):
    status: CardStatus


def handle_database_error(error: APIError) -> None:
    logger.exception("Supabase request failed", exc_info=error)
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="The database request failed",
    ) from error


@app.get("/cards", response_model=list[Card])
def list_cards() -> list[Card]:
    try:
        response = (
            supabase.table("cards")
            .select("*")
            .order("created_at")
            .execute()
        )
    except APIError as error:
        handle_database_error(error)
    return response.data


@app.post("/cards", response_model=Card, status_code=status.HTTP_201_CREATED)
def create_card(card: CardCreate) -> Card:
    try:
        response = (
            supabase.table("cards")
            .insert({"title": card.title, "status": "todo"})
            .select("*")
            .single()
            .execute()
        )
    except APIError as error:
        handle_database_error(error)
    return response.data


@app.patch("/cards/{card_id}", response_model=Card)
def update_card(card_id: int, update: CardUpdate) -> Card:
    try:
        response = (
            supabase.table("cards")
            .update({"status": update.status})
            .eq("id", card_id)
            .select("*")
            .execute()
        )
    except APIError as error:
        handle_database_error(error)

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found",
        )
    return response.data[0]


@app.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int) -> Response:
    try:
        response = (
            supabase.table("cards")
            .delete()
            .eq("id", card_id)
            .execute()
        )
    except APIError as error:
        handle_database_error(error)

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
