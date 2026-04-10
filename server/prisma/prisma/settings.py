
from pathlib import Path
from datetime import timedelta
from urllib.parse import quote_plus
import os
import dj_database_url
from celery.schedules import crontab
from google.oauth2 import service_account





BASE_DIR = Path(__file__).resolve().parent.parent

# production | staging — not the same as DEBUG (staging can use DEBUG=False for prod-like behavior).
PRISMA_ENV = os.getenv('PRISMA_ENV', 'production').strip().lower()
IS_STAGING = PRISMA_ENV == 'staging'
# Docker Redis hostname: prod share vs staging (single instance from client staging stack).
_DEFAULT_REDIS_HOST = 'client_staging_redis' if IS_STAGING else 'prisma_redis'

SECRET_KEY= os.getenv('DJANGO_SECRET_KEY')
BASE_URL = os.getenv('BASE_URL')


# Production: client.prismavalet.com on droplet. Override via env for local/dev.
_CLIENT_ORIGIN = os.getenv('CLIENT_ORIGIN', 'https://c620-2a02-8084-c80-ea80-3d81-12aa-43f9-717.ngrok-free.app')
# Base URL for email links (e.g. Privacy Policy, Terms). Defaults to client origin.
FRONTEND_BASE_URL = os.getenv('FRONTEND_BASE_URL', _CLIENT_ORIGIN).rstrip('/')
# Prismahome (landing site) often runs on localhost:3000; allow it for terms/privacy API calls.
_DEFAULT_CORS_ORIGINS = [_CLIENT_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000']
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', _CLIENT_ORIGIN).split(',') if os.getenv('ALLOWED_ORIGINS') else [_CLIENT_ORIGIN]
CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', _CLIENT_ORIGIN).split(',') if os.getenv('CSRF_TRUSTED_ORIGINS') else [_CLIENT_ORIGIN]
CORS_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://c620-2a02-8084-c80-ea80-3d81-12aa-43f9-717.ngrok-free.app']

CORS_ALLOW_CREDENTIALS = True
_allowed_hosts_env = os.getenv('ALLOWED_HOSTS')
if _allowed_hosts_env:
    ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_env.split(',') if h.strip()]
else:
    ALLOWED_HOSTS = ['*']


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
        return (
            f'postgresql://{quote_plus(user)}:{quote_plus(password)}'
            f'@{host}:{port}/{db}'
        )
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
    MEDIA_URL = '/media/'
    MEDIA_ROOT = BASE_DIR / 'media'
    STORAGES = {
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
else:
    GS_BUCKET_NAME = os.getenv('GS_BUCKET_NAME', 'prisma-valet-bucket')
    GS_LOCATION = os.getenv('GS_LOCATION', 'main-app')
    GS_CREDENTIALS_PATH = os.getenv('GS_CREDENTIALS_PATH', '')
    GS_CREDENTIALS = None
    if GS_CREDENTIALS_PATH and Path(GS_CREDENTIALS_PATH).is_file():
        GS_CREDENTIALS = service_account.Credentials.from_service_account_file(
            GS_CREDENTIALS_PATH,
            scopes=['https://www.googleapis.com/auth/cloud-platform'],
        )
    MEDIA_URL = f'https://storage.googleapis.com/{GS_BUCKET_NAME}/'
    MEDIA_ROOT = BASE_DIR / 'media'
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.gcloud.GoogleCloudStorage',
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }

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


CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [f'redis://{_redis_host}:{_redis_port}'],
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
    "LEEWAY": 0,
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
}

AUTH_USER_MODEL = 'main.User'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

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
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

# VIN Lookup Configuration
from decimal import Decimal
VIN_LOOKUP_PRICE = Decimal(os.getenv('VIN_LOOKUP_PRICE', '3.00'))
VIN_LOOKUP_ACCESS_DURATION_HOURS = int(os.getenv('VIN_LOOKUP_ACCESS_DURATION_HOURS', '24'))

# Detailer app URL for server-to-server communication (client -> detailer booking API).
# Set DETAILER_APP_URL to the detailer app's full base URL so the client can reach it without
# relying on Docker DNS. Example: https://YOUR_SUBDOMAIN.ngrok-free.app/detailer
# or https://detailer.yourdomain.com (no trailing slash).
DETAILER_APP_URL = os.getenv('DETAILER_APP_URL', '').strip() or None

# Shared secret for support server -> client dashboard metrics (header X-Support-Internal-Key).
SUPPORT_INTERNAL_API_KEY = (os.getenv('SUPPORT_INTERNAL_API_KEY') or '').strip()

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