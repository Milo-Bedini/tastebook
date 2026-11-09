import os
from pathlib import Path

import dj_database_url

from config.sentry import init_sentry

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get('DJANGO_DEBUG', 'false').lower() == 'true'

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError('DJANGO_SECRET_KEY must be set unless DJANGO_DEBUG is true')
    SECRET_KEY = 'insecure-local-only-key'

VERCEL_ENV = os.environ.get('VERCEL_ENV', '')

# Throwaway accounts at a reserved domain, for end-to-end tests: open locally and in CI, behind the previews'
# bypass secret on previews, and refused on production.
TEST_ACCOUNT_DOMAIN = 'tastebook.test'
TEST_ACCOUNTS_ENABLED = DEBUG or VERCEL_ENV == 'preview'
TEST_ACCOUNT_CODES_NEED_SECRET = not DEBUG
# Vercel sets this on deployments when Protection Bypass for Automation is on.
TEST_ACCOUNT_SECRET = os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET', '')

DEFAULT_FROM_EMAIL = os.environ.get('DJANGO_DEFAULT_FROM_EMAIL', 'Tastebook <noreply@tastebook.dev>')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
if RESEND_API_KEY:
    MAILER = {
        'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
        'OPTIONS': {
            'host': 'smtp.resend.com',
            'port': 465,
            'use_ssl': True,
            'username': 'resend',
            'password': RESEND_API_KEY,
            'timeout': 10,
        },
    }
elif VERCEL_ENV == 'production':
    raise RuntimeError('RESEND_API_KEY must be set on production')
elif DEBUG:
    MAILER = {'BACKEND': 'django.core.mail.backends.console.EmailBackend'}
else:
    # Previews send no email: only test accounts, whose codes are stored instead, can sign in there.
    MAILER = {'BACKEND': 'django.core.mail.backends.dummy.EmailBackend'}
MAILERS = {'default': MAILER}

init_sentry()

# On Vercel, the hosts this deployment answers on: its own URL, its branch's and production's. Vercel sets these, so
# nothing has to list them, and no other *.vercel.app host is trusted.
VERCEL_HOSTS = [
    os.environ[name]
    for name in ('VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL')
    if os.environ.get(name)
]

ALLOWED_HOSTS = [
    *(host for host in os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if host),
    *VERCEL_HOSTS,
]

CSRF_TRUSTED_ORIGINS = [f'https://{host}' for host in VERCEL_HOSTS]

if not DEBUG:
    # Vercel ends TLS and forwards the scheme; cookies only travel over HTTPS.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

INSTALLED_APPS = [
    'households.admin_apps.StaffAdminConfig',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'rest_framework',
    'drf_spectacular',
    'households',
    'allauth',
    'allauth.account',
    'allauth.mfa',
    'allauth.headless',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
    'health',
    'recipes',
    'recipe_collections',
    'seed',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'allauth.account.middleware.AccountMiddleware',
]

ROOT_URLCONF = 'config.urls'

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

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': dj_database_url.config(
        default='postgres://tastebook:tastebook@localhost:5432/tastebook',
        conn_max_age=600,
        conn_health_checks=True,
    )
}
# Neon's pooled connection runs PgBouncer in transaction mode, which can't hold a server-side cursor open.
DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'django_cache',
        # Room for every live limit, so culling never drops an address's history early.
        'OPTIONS': {'MAX_ENTRIES': 10_000},
    }
}

AUTH_USER_MODEL = 'households.User'

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

# Signed in for 30 days from the last request: each request sets the cookie again.
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_SAVE_EVERY_REQUEST = True

ACCOUNT_ADAPTER = 'households.adapter.AccountAdapter'
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_LOGIN_METHODS = {'email'}
ACCOUNT_SIGNUP_FIELDS = ['email*']
ACCOUNT_EMAIL_VERIFICATION = 'mandatory'
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_ENABLED = True
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_TIMEOUT = 10 * 60
ACCOUNT_LOGIN_BY_CODE_ENABLED = True
ACCOUNT_LOGIN_BY_CODE_TIMEOUT = 10 * 60
ACCOUNT_RATE_LIMITS = {'request_login_code': '20/m/ip,3/10m/key'}
ACCOUNT_LOGIN_BY_CODE_MAX_ATTEMPTS = 5
ACCOUNT_EMAIL_VERIFICATION_BY_CODE_MAX_ATTEMPTS = 5
# Signing up and signing in share one email field, so asking for a code says whether an account exists.
ACCOUNT_PREVENT_ENUMERATION = False
ACCOUNT_SESSION_REMEMBER = True
ACCOUNT_EMAIL_SUBJECT_PREFIX = ''
ALLAUTH_USER_CODE_FORMAT = {'numeric': True, 'length': 6, 'dashed': False}
if VERCEL_ENV:
    # Vercel sets X-Real-IP to the client's address and overwrites one the client sends.
    ALLAUTH_TRUSTED_CLIENT_IP_HEADER = 'X-Real-IP'
HEADLESS_ONLY = True
HEADLESS_CLIENTS = ('browser',)

# Photos people upload go to the Vercel Blob store tastebook-photos, which production and every preview share, so each
# environment keeps its own under recipes/<environment>/ and deletes only those. Without the token, uploads answer 503.
BLOB_READ_WRITE_TOKEN = os.environ.get('BLOB_READ_WRITE_TOKEN', '')
PHOTO_ENVIRONMENT = VERCEL_ENV or 'development'

SOCIALACCOUNT_ADAPTER = 'households.adapter.SocialAccountAdapter'
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '')
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        # Without the client (previews, local runs) Google isn't offered: its only redirect is production's address.
        'APPS': [{'client_id': GOOGLE_OAUTH_CLIENT_ID, 'secret': GOOGLE_OAUTH_CLIENT_SECRET}]
        if GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET
        else [],
        'SCOPE': ['profile', 'email'],
    }
}
# Google checks the address, so a Google sign-in with an account's address signs in to that account.
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True
# Google has checked the address (the adapter refuses one it hasn't), so signing in with Google sends no code.
SOCIALACCOUNT_EMAIL_VERIFICATION = 'none'
# Where a Google sign-in that went wrong before its state was known returns, with ?error=.
HEADLESS_FRONTEND_URLS = {'socialaccount_login_error': '/sign-in'}

# Staff only: an account with an authenticator is asked for its code at every sign-in (households.admin_site).
MFA_SUPPORTED_TYPES = ['totp', 'recovery_codes']
MFA_TOTP_ISSUER = 'Tastebook'
# A code from the 30 seconds either side is accepted, for a phone whose clock has drifted.
MFA_TOTP_TOLERANCE = 1

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-gb'
TIME_ZONE = 'Europe/London'
USE_I18N = True
USE_TZ = True

# Under /api, the only path that reaches Django on Vercel; Vercel collects the files into STATIC_ROOT and serves them.
STATIC_URL = '/api/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Tastebook API',
    'DESCRIPTION': 'Recipe hub API',
    'VERSION': '0.1.0',
    'SERVE_INCLUDE_SCHEMA': False,
    # Named for the glossary's term rather than the field it first appears on.
    'ENUM_NAME_OVERRIDES': {
        'DietTag': 'recipes.models.DietTag',
        'InviteStatus': 'households.models.InviteStatus',
        'ReportReason': 'recipes.models.ReportReason',
        'UnitSystem': 'households.models.UnitSystem',
        'Visibility': 'recipes.models.Visibility',
    },
}
