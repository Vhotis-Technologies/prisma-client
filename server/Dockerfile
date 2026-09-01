FROM python:3.11-slim

# Set the environment variable
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONHASHSEED=random

WORKDIR /app

# Install dependencies (gcc for Python packages, fonts for image watermarking)
RUN apt-get update && apt-get install -y \
    gcc \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Bake admin/CSS into the image (runtime uses DEBUG=False + WhiteNoise).
ENV DJANGO_SETTINGS_MODULE=prisma.settings
RUN cd prisma && \
    env PRISMA_ENV=staging \
        DATABASE_URL=sqlite:////tmp/buildcollect.sqlite3 \
        DJANGO_SECRET_KEY=build-collect-static-only-not-used-at-runtime \
        python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "prisma.asgi:application"]