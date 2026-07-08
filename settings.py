import datetime
import os
from pathlib import Path
from urllib.parse import quote_plus
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
backend_dir: Path = _backend_dir
load_dotenv(_backend_dir / ".env")  # backend/.env takes precedence
load_dotenv(_backend_dir.parent / ".env")  # top-level .env as fallback

version = "1.0.11"
INSTALLED_APPS = os.getenv("INSTALLED_APPS", "core, cms")
APP_DIRS = os.getenv("APP_DIRS", "apps, deepsel.apps")

# Astro client configuration
NO_CLIENT = os.getenv("NO_CLIENT", "").lower() in ("true", "1")
LOCAL_PACKAGES = os.getenv("LOCAL_PACKAGES", "").lower() in ("true", "1")
CLIENT_HOST = os.getenv("CLIENT_HOST", "0.0.0.0")  # nosec B104
CLIENT_PORT = os.getenv("CLIENT_PORT", "4321")
SHELL = os.getenv("SHELL", "/bin/sh")

# API configuration
API_VERSION = "v1"
API_PREFIX = f"/api/{API_VERSION}"

# Database
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", 5432)
DB_NAME = os.getenv("DB_NAME", "")
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DATABASE_URL = f"postgresql+psycopg://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}@{quote_plus(DB_HOST)}:{DB_PORT}/{quote_plus(DB_NAME)}"
# Database optionals
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", 10))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", 20))

# General settings
FILESYSTEM = os.getenv("FILESYSTEM", "local")
UPLOAD_SIZE_LIMIT = float(os.getenv("UPLOAD_SIZE_LIMIT", 5))  # unit: Megabyte
# Max storage limit in MB, None means unlimited
MAX_STORAGE_LIMIT = os.getenv("MAX_STORAGE_LIMIT", None)
if MAX_STORAGE_LIMIT is not None:
    MAX_STORAGE_LIMIT = float(MAX_STORAGE_LIMIT)
APP_SECRET = os.getenv("APP_SECRET", "your-secret-key")
PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8000")

# Optional
AUTH_ALGORITHM = os.getenv("AUTH_ALGORITHM", "HS256")

# --- OIDC app (backend/apps/oidc) ---
# The OIDC routes are always installed; whether SSO is offered is driven entirely
# by enabled provider rows (an org with no enabled providers simply shows none).
# Degraded-mode grace: during a confirmed IdP outage, accept ID tokens whose
# `exp` is within OIDC_DEGRADED_GRACE_SECONDS of now using the last-cached JWKS.
OIDC_DEGRADED_GRACE = os.getenv("OIDC_DEGRADED_GRACE", "false").lower() in (
    "true",
    "1",
)
OIDC_DEGRADED_GRACE_SECONDS = int(os.getenv("OIDC_DEGRADED_GRACE_SECONDS", 300))
# Network timeout (seconds) for discovery/JWKS fetches.
OIDC_HTTP_TIMEOUT = float(os.getenv("OIDC_HTTP_TIMEOUT", 5))

# ClamAV (Optional)
CLAMAV_HOST = os.getenv("CLAMAV_HOST", None)

# AWS S3 (Optional)
S3_BUCKET = os.getenv("S3_BUCKET")
S3_BACKUP_BUCKET = os.getenv("S3_BACKUP_BUCKET")
S3_PRESIGN_EXPIRATION = datetime.timedelta(
    minutes=int(os.getenv("S3_PRESIGN_EXPIRATION_MINUTES", 5))
)
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")

# Azure Blob Storage (Optional)
AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_STORAGE_KEY = os.getenv("AZURE_STORAGE_KEY")
AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER")

# Native Service
NATIVE_SERVICE_URL = os.getenv("NATIVE_SERVICE_URL")
NATIVE_SERVICE_API_KEY = os.getenv("NATIVE_SERVICE_API_KEY")
LOKI_ENDPOINT = os.getenv("LOKI_ENDPOINT")
DEFAULT_ORG_ID = 1

AUTHLESS = os.getenv("AUTHLESS", "false").lower() in ["true", "1", "yes"]

# Session store
SESSION_STORE_BACKEND = os.getenv(
    "SESSION_STORE", None
)  # redis|postgres|filesystem|None (auto-detect)
REDIS_URL = os.getenv("REDIS_URL", None)
SESSION_DIR = os.getenv("SESSION_DIR", None)
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "true").lower() in [
    "true",
    "1",
    "yes",
]
SESSION_COOKIE_NAME = "session_id"

# CORS
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
CORS_ALLOWED_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
)

# Server flags
ONLY_MIGRATE = os.getenv("ONLY_MIGRATE", "").lower() in ("true", "1", "yes")
NO_MIGRATE = os.getenv("NO_MIGRATE", "").lower() in ("true", "1", "yes")

if ONLY_MIGRATE and NO_MIGRATE:
    raise ValueError("Cannot use both ONLY_MIGRATE and NO_MIGRATE")
ENABLE_GRAPHQL = os.getenv("ENABLE_GRAPHQL", "").lower() in ("true", "1", "yes")
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "").lower() in ("true", "1", "yes")
