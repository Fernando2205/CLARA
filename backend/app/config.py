from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


class Settings:
    def __init__(self) -> None:
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.transcribe_model = os.getenv("OPENAI_TRANSCRIBE_MODEL", "whisper-1")
        self.voice_model = os.getenv("OPENAI_VOICE_MODEL", "gpt-4o-mini-tts")
        self.voice_name = os.getenv("OPENAI_VOICE", "coral")
        self.voice_cache_dir = self._path("VOICE_CACHE_DIR", "voice_cache")
        self.frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
        self.database_path = self._path("DATABASE_PATH", "clara.db")
        self.generated_dir = self._path("GENERATED_DIR", "generated")
        self.telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        self.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        self.resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
        self.report_from_email = os.getenv(
            "REPORT_FROM_EMAIL", "CLARA <reportes@tu-dominio.com>"
        )

    @staticmethod
    def _path(name: str, default: str) -> Path:
        value = Path(os.getenv(name, default))
        return value if value.is_absolute() else BACKEND_DIR / value


@lru_cache
def get_settings() -> Settings:
    return Settings()
