
from pathlib import Path
from datetime import timedelta
from urllib.parse import quote_plus, urlparse
import os
import dj_database_url
from celery.schedules import crontab
from corsheaders.defaults import default_headers
from google.oauth2 import service_account
import json
# Env names
CAR_REG_USERNAME = os.getenv("CAR_REG_USERNAME", "vhotis").strip() or None

BASE_DIR = Path(__file__).resolve().parent.parent

# production | staging — not the same as DEBUG (staging can use DEBUG=False for prod-like behavior).
PRISMA_ENV = os.getenv('PRISMA_ENV', 'production').strip().lower()
IS_STAGING = PRISMA_ENV == 'staging'

# Docker Redis hostname: prod share vs staging (single instance from client staging stack).
_DEFAULT_REDIS_HOST = 'client_staging_redis' if IS_STAGING else 'prisma_redis'

SECRET_KEY= os.getenv('DJANGO_SECRET_KEY')
# How long branch-admin (and future) invite links stay valid.
INVITE_TOKEN_EXPIRY_HOURS = int(os.getenv('INVITE_TOKEN_EXPIRY_HOURS', '48'))
# Guest booking results link lifetime (multi-view until expiry or revoke).
GUEST_ACCESS_TOKEN_EXPIRY_DAYS = int(os.getenv('GUEST_ACCESS_TOKEN_EXPIRY_DAYS', '14'))

# Public origins: BASE_URL = Django API, CLIENT_WEB_BASE_URL = Prisma Web SPA.
_DEFAULT_API = (
    'https://staging.client.prismavalet.com'
    if IS_STAGING
    else 'https://client.prismavalet.com'
)
BASE_URL = (
    os.getenv('BASE_URL') or os.getenv('CLIENT_ORIGIN') or _DEFAULT_API
).strip().rstrip('/')

_DEFAULT_WEB = (
    'https://staging.app.prismavalet.com' if IS_STAGING else 'https://app.prismavalet.com'
)
# Vite dev origins — used to ignore localhost CLIENT_WEB_BASE_URL when BASE_URL is a public tunnel.
_LOCAL_WEB_DEV_ORIGINS = frozenset({
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
})


def _client_web_base_from_api_url(api_url: str) -> str | None:
    """
    Derive the Prisma Web SPA origin from the public API BASE_URL.

    Staging nginx serves the API at ``/client`` and the SPA at ``/app`` on the same host.
  """
    root = api_url.rstrip('/')
    if root.endswith('/client'):
        return f"{root[: -len('/client')]}/app"
    return None


_raw_client_web = (os.getenv('CLIENT_WEB_BASE_URL') or '').strip().rstrip('/')
if _raw_client_web and not (
    IS_STAGING
    and _raw_client_web in _LOCAL_WEB_DEV_ORIGINS
    and _client_web_base_from_api_url(BASE_URL)
):
    CLIENT_WEB_BASE_URL = _raw_client_web
elif IS_STAGING and _client_web_base_from_api_url(BASE_URL):
    CLIENT_WEB_BASE_URL = _client_web_base_from_api_url(BASE_URL)
else:
    CLIENT_WEB_BASE_URL = (_raw_client_web or _DEFAULT_WEB).strip().rstrip('/')

# Partner-referred users: optional % discount on bookings (separate from one-time complimentary wash).
PARTNER_REFERRED_BOOKING_DISCOUNT_PERCENT = int(
    os.getenv('PARTNER_REFERRED_BOOKING_DISCOUNT_PERCENT', '30').strip().split('.', 1)[0] or '30'
)
# Browser origins. django-cors-headers reads CORS_ALLOWED_ORIGINS (not ALLOWED_ORIGINS).
# Vite uses 5173 by default and hops to 5174+ when that port is taken.
_WEB_DEV_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
# Django CSRF_TRUSTED_ORIGINS supports https://*.example.com (ALLOWED_HOSTS-style
# suffixes do not). Staging ngrok subdomains rotate; do not require .env updates.
_STAGING_NGROK_CSRF_ORIGINS = [
    'https://*.ngrok-free.app',
    'https://*.ngrok.io',
    'https://*.ngrok.app',
]
_STAGING_NGROK_CORS_REGEXES = [
    r'^https://[\w-]+\.ngrok-free\.app$',
    r'^https://[\w-]+\.ngrok\.io$',
    r'^https://[\w-]+\.ngrok\.app$',
]


def _append_unique(dest: list[str], values: list[str]) -> None:
    for value in values:
        if value and value not in dest:
            dest.append(value)


def _origin_only(value: str) -> str:
    """CORS/CSRF origins are scheme+host+port — strip paths like /client."""
    parsed = urlparse(value.strip())
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return value.strip().rstrip("/")


def _split_origins(raw: str | None, fallback: list[str]) -> list[str]:
    sources = raw.split(",") if raw and raw.strip() else fallback
    seen: set[str] = set()
    out: list[str] = []
    for origin in sources:
        value = _origin_only(origin) if isinstance(origin, str) else ""
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


_DEFAULT_CORS_ORIGINS = [
    BASE_URL,
    CLIENT_WEB_BASE_URL,
    'https://prismavalet.com',
    'https://www.prismavalet.com',
    *_WEB_DEV_ORIGINS,
]
CORS_ALLOWED_ORIGINS = _split_origins(
    os.getenv('CORS_ALLOWED_ORIGINS') or os.getenv('ALLOWED_ORIGINS'),
    _DEFAULT_CORS_ORIGINS,
)
# Staging: always allow local Vite (prisma_web) and CRA (prismahome) even if env omitted them.
if IS_STAGING:
    _append_unique(CORS_ALLOWED_ORIGINS, _WEB_DEV_ORIGINS)
    # Exact-origin lists miss Vite's next port and rotating ngrok hosts.
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        *_STAGING_NGROK_CORS_REGEXES,
    ]

CSRF_TRUSTED_ORIGINS = _split_origins(
    os.getenv('CSRF_TRUSTED_ORIGINS'),
    CORS_ALLOWED_ORIGINS,
)
_append_unique(CSRF_TRUSTED_ORIGINS, [_origin_only(BASE_URL), _origin_only(CLIENT_WEB_BASE_URL)])
if IS_STAGING:
    _append_unique(CSRF_TRUSTED_ORIGINS, _WEB_DEV_ORIGINS)
    _append_unique(CSRF_TRUSTED_ORIGINS, _STAGING_NGROK_CSRF_ORIGINS)
CORS_ALLOW_CREDENTIALS = True
# Ngrok free tunnels intercept browser GETs unless this header is present.
CORS_ALLOW_HEADERS = (
    *default_headers,
    'ngrok-skip-browser-warning',
)


def _build_allowed_hosts() -> list[str]:
    raw = (os.getenv('ALLOWED_HOSTS') or '').strip()
    hosts = [h.strip() for h in raw.split(',') if h.strip()] if raw else [
        'localhost',
        '127.0.0.1',
        'client.prismavalet.com',
        'client_staging_server',
    ]
    explicit_wildcard = '*' in hosts
    if explicit_wildcard:
        # Single-item wildcard supported by Django; never mix with hostname list.
        return ['*']

    seen: set[str] = set()
    out: list[str] = []

    def add(h: str) -> None:
        key = h.lower()
        if key not in seen:
            seen.add(key)
            out.append(h)

    for h in hosts:
        add(h)

    # Rotating Ngrok tunnels: subdomain changes per session — allow any subdomain of these roots.
    if IS_STAGING:
        for suffix in ('.ngrok-free.app', '.ngrok.io', '.ngrok.app'):
            add(suffix)

    return out

ALLOWED_HOSTS = _build_allowed_hosts()
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

DEBUG = os.getenv('DEBUG') == 'True'
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'main',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'channels',
    'channels_redis',
    'django_celery_beat',
    'storages',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'prisma.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases
# DATABASE_URL or POSTGRES_* required (Postgres only for this project).


def _resolve_database_url():
    explicit = os.getenv('DATABASE_URL', '').strip()
    if explicit:
        return explicit
    user = os.getenv('POSTGRES_USER')
    password = os.getenv('POSTGRES_PASSWORD')
    host = os.getenv('POSTGRES_HOST')
    port = os.getenv('POSTGRES_PORT', '5432')
    db = os.getenv('POSTGRES_DB')
    if user and password and host and db:
        url = (
            f'postgresql://{quote_plus(user)}:{quote_plus(password)}'
            f'@{host}:{port}/{db}'
        )
        sslmode = os.getenv('POSTGRES_SSLMODE', '').strip()
        if sslmode:
            sep = '&' if '?' in url else '?'
            url = f'{url}{sep}sslmode={quote_plus(sslmode)}'
        return url
    return ''


_database_url = _resolve_database_url()
if not _database_url:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        'Set DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST, and POSTGRES_DB '
        f'(PRISMA_ENV={PRISMA_ENV!r}).'
    )
DATABASES = {
    'default': dj_database_url.config(
        default=_database_url,
        conn_max_age=int(os.getenv('DATABASE_CONN_MAX_AGE', '600')),
    ),
}


# Staging: local media. Production: Google Cloud Storage (django-storages reads GS_* from settings).
if IS_STAGING:
    credential_staging = json.loads(os.getenv('GS_CREDENTIALS_PATH_STAGING'))
    GS_BUCKET_NAME_STAGING = os.getenv('GS_BUCKET_NAME_STAGING', 'prisma_staging_bucket')
    GS_LOCATION_STAGING = os.getenv('GS_LOCATION_STAGING', 'main-app')
    GS_CREDENTIALS_STAGING = service_account.Credentials.from_service_account_info(
        credential_staging,
        scopes=['https://www.googleapis.com/auth/cloud-platform'],
    )
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.gcloud.GoogleCloudStorage',
            'OPTIONS': {
                'bucket_name': GS_BUCKET_NAME_STAGING,
                'location': GS_LOCATION_STAGING,
                'credentials': GS_CREDENTIALS_STAGING,
                'default_acl': None,
            },
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
else:
    credentials = json.loads(os.getenv('GS_CREDENTIALS_PATH'))
    GS_BUCKET_NAME = os.getenv('GS_BUCKET_NAME', 'prisma-valet-bucket')
    GS_LOCATION = os.getenv('GS_LOCATION', 'main-app')
    GS_CREDENTIALS_PATH = os.getenv('GS_CREDENTIALS_PATH')
    GS_CREDENTIALS = service_account.Credentials.from_service_account_info(
        credentials,
        scopes=['https://www.googleapis.com/auth/cloud-platform'],
    )
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.gcloud.GoogleCloudStorage',
            'OPTIONS': {
                'bucket_name': GS_BUCKET_NAME,
                'location': GS_LOCATION,
                'credentials': GS_CREDENTIALS,
                'default_acl': None,
            },
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
    MEDIA_URL = f'https://storage.googleapis.com/{GS_BUCKET_NAME}/{GS_LOCATION}/'

# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Europe/London'
USE_I18N = True
USE_TZ = True

_redis_host = os.getenv('REDIS_HOST', _DEFAULT_REDIS_HOST)
_redis_port = int(os.getenv('REDIS_PORT', '6379'))

# Cache (for django-ratelimit and other usage; Redis shared with Celery/Channels, different DB index)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv(
            'REDIS_URL',
            f'redis://{_redis_host}:{_redis_port}/2',
        ),
        'OPTIONS': {},
    },
}

# REST Framework Configuration — browsable API only when staging and DEBUG (prod-like staging: JSON only).
_rest_renderers = ['rest_framework.renderers.JSONRenderer']
if IS_STAGING and DEBUG:
    _rest_renderers.append('rest_framework.renderers.BrowsableAPIRenderer')
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_RENDERER_CLASSES': tuple(_rest_renderers),
    'DEFAULT_PARSER_CLASSES': (
        'rest_framework.parsers.MultiPartParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.JSONParser',
    ),
}


# Dedicated DB so Channels idle waits do not share Celery broker DB 0.
# Pub/sub layer avoids BZPOPMIN, which redis-py asyncio treats as a hard timeout.
_redis_db_channels = int(os.getenv('REDIS_CHANNELS_DB', '5'))
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.pubsub.RedisPubSubChannelLayer",
        "CONFIG": {
            "hosts": [f"redis://{_redis_host}:{_redis_port}/{_redis_db_channels}"],
        },
    },
}

# WebSocket Configuration
CHANNELS_WS_PROTOCOLS = ["websocket"]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=5),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=120),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "VERIFYING_KEY": "",
    "AUDIENCE": None,
    "ISSUER": None,
    "JSON_ENCODER": None,
    "JWK_URL": None,
    "LEEWAY": 30,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "TOKEN_USER_CLASS": "rest_framework_simplejwt.models.TokenUser",
    "JTI_CLAIM": "jti",
    "SLIDING_TOKEN_REFRESH_EXP_CLAIM": "refresh_exp",
    "SLIDING_TOKEN_LIFETIME": timedelta(minutes=60),
    "SLIDING_TOKEN_REFRESH_LIFETIME": timedelta(days=1),
    "TOKEN_OBTAIN_SERIALIZER": "rest_framework_simplejwt.serializers.TokenObtainPairSerializer",
    "TOKEN_REFRESH_SERIALIZER": "rest_framework_simplejwt.serializers.TokenRefreshSerializer",
    "TOKEN_VERIFY_SERIALIZER": "rest_framework_simplejwt.serializers.TokenVerifySerializer",
    "TOKEN_BLACKLIST_SERIALIZER": "rest_framework_simplejwt.serializers.TokenBlacklistSerializer",
    "SLIDING_TOKEN_OBTAIN_SERIALIZER": "rest_framework_simplejwt.serializers.TokenObtainSlidingSerializer",
    "SLIDING_TOKEN_REFRESH_SERIALIZER": "rest_framework_simplejwt.serializers.TokenRefreshSlidingSerializer",
}


CELERY_BROKER_URL = os.getenv(
    'CELERY_BROKER_URL',
    f'redis://{_redis_host}:{_redis_port}/0',
)
CELERY_RESULT_BACKEND = os.getenv(
    'CELERY_RESULT_BACKEND',
    f'redis://{_redis_host}:{_redis_port}/1',
)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_DEFAULT_QUEUE = 'client_queue'
CELERY_TASK_DEFAULT_QUEUE = 'client_queue'

# Celery Beat Configuration
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_BEAT_SCHEDULE = {
    'send-service-reminders': {
        'task': 'main.tasks.send_service_reminders',
        'schedule': 300.0,  # Run every 5 minutes (300 seconds)
    },
    'send-six-hour-booking-reminder-emails': {
        'task': 'main.tasks.send_six_hour_booking_reminder_emails',
        'schedule': 300.0,  # Every 5 minutes; 10-minute send window around T-6h
    },
    'send-promotion-expiration': {
        'task': 'main.tasks.send_promotion_expiration',
        'schedule': crontab(hour=6, minute=0) # Run at 6:00 AM every day
    },
    'check-loyalty-decay': {
        'task': 'main.tasks.check_loyalty_decay',
        'schedule': crontab(hour=3, minute=0)  # Run at 3:00 AM every day
    },
    'send-b2c-subscription-expiry-reminders': {
        'task': 'main.tasks.send_b2c_subscription_expiry_reminders',
        'schedule': crontab(hour=7, minute=30),
    },
}

AUTH_USER_MODEL = 'main.User'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

WHITENOISE_USE_FINDERS = DEBUG

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Email Configuration (for production)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST')
EMAIL_PORT = 587
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False
DEFAULT_FROM_EMAIL = os.getenv('EMAIL_HOST_USER')

# Asgi Application
ASGI_APPLICATION = 'prisma.asgi.application'

# Stripe Configuration
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY', '')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
GOOGLE_PLACES_API_KEY = os.getenv('GOOGLE_PLACES_API_KEY', '')

# Late reschedule fee (minor units / “cents”, same as Stripe PaymentIntent.amount)
RESCHEDULE_FEE_CENTS = int(os.getenv('RESCHEDULE_FEE_CENTS', '1000'))

# Detailer app URL for server-to-server calls (create booking, timeslot proxy).
# Use the public project URL (https://staging.crew… or https://crew…), not Docker DNS.
# Auth is X-Client-Internal-Key (DETAILER_API_SECRET == detailer CLIENT_SERVER_SECRET).
def _public_project_url(env_value, path_segment):
    """Prefer an explicit public URL; ignore Docker hostnames and fall back to BASE_URL."""
    from urllib.parse import urlparse

    raw = (env_value or "").strip() or None
    if raw:
        host = (urlparse(raw).hostname or "")
        if host.endswith("_staging_server"):
            raw = None
    if raw:
        return raw.rstrip("/")
    base = (os.getenv("BASE_URL") or "").strip()
    parsed = urlparse(base)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}/{path_segment.strip('/')}"
    return None


DETAILER_APP_URL = _public_project_url(os.getenv("DETAILER_APP_URL"), "detailer")
# Shared secret sent as X-Client-Internal-Key; must match detailer CLIENT_SERVER_SECRET.
DETAILER_API_SECRET = (os.getenv('DETAILER_API_SECRET') or '').strip()

# Shared secret for support server -> client dashboard metrics (header X-Support-Internal-Key).
SUPPORT_INTERNAL_API_KEY = (os.getenv('SUPPORT_INTERNAL_API_KEY') or '').strip()

# Mobile app store URLs (winner voucher notification emails).
APP_STORE_URL = (os.getenv('APP_STORE_URL') or 'https://example.com/dummy-app-store').strip()
PLAY_STORE_URL = (os.getenv('PLAY_STORE_URL') or 'https://example.com/dummy-play-store').strip()

# Logging Configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
        'error_file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django_error.log',
            'formatter': 'verbose',
        },
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'root': {
        'handlers': ['console', 'file', 'error_file'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'main': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'main.views.booking': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}