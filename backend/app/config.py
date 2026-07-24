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
        self.voice_cache_dir = self._path("VOICE_CACHE_DIR", "voice_cache")
        self.elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
        self.elevenlabs_voice_id = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
        self.elevenlabs_model = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")
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
