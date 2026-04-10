import os
from celery import Celery
from celery.schedules import crontab

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'prisma.settings')

app = Celery('prisma')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

# Configure periodic tasks
app.conf.beat_schedule = {
    'send-service-reminders': {
        'task': 'main.tasks.send_service_reminders',
        'schedule': crontab(minute='*/5'),  # Run every 5 minutes
    },
    'send-six-hour-booking-reminder-emails': {
        'task': 'main.tasks.send_six_hour_booking_reminder_emails',
        'schedule': crontab(minute='*/5'),
    },
}

app.conf.timezone = 'UTC'


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')