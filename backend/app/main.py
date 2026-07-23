from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from seed.seed import seed_if_empty

from .config import get_settings
from .db import connect
from .routers import assistant, extract, inventory, report, sessions, speech, transcribe, validate

settings = get_settings()
settings.generated_dir.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_if_empty()
    yield


app = FastAPI(
    title="CLARA API",
    version="0.1.0",
    description="Captura de inventario por voz con validación determinística.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(extract.router)
app.include_router(assistant.router)
app.include_router(inventory.router)
app.include_router(validate.router)
app.include_router(transcribe.router)
app.include_router(speech.router)
app.include_router(sessions.router)
app.include_router(report.router)
app.mount("/files", StaticFiles(directory=settings.generated_dir), name="files")


@app.get("/health")
def health() -> dict:
    with connect() as connection:
        articles = connection.execute("SELECT COUNT(*) FROM articulos").fetchone()[0]
    return {
        "status": "ok",
        "database": "ok",
        "articulos": articles,
        "openai_configurado": bool(settings.openai_api_key),
        "voz_natural_configurada": bool(settings.openai_api_key),
        "modelo_voz": settings.voice_model,
    }
