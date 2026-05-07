# Generated manually for BulkOrder invoice reminder dedupe fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='bulkorder',
            name='invoice_due_soon_email_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='bulkorder',
            name='invoice_overdue_email_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
