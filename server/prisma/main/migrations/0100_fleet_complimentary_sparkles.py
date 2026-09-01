# Generated migration for fleet complimentary sparkles feature

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0015_minimise_vehicle_lookup_payload'),
    ]

    operations = [
        migrations.AddField(
            model_name='fleet',
            name='complimentary_sparkle_quota',
            field=models.IntegerField(default=4),
        ),
        migrations.CreateModel(
            name='FleetComplimentaryBooking',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('vehicles_applied', models.PositiveIntegerField(default=1)),
                ('used_at', models.DateTimeField(auto_now_add=True)),
                ('subscription_period_start', models.DateTimeField()),
                ('booking', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='main.bookedappointment')),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='complimentary_bookings', to='main.branch')),
                ('bulk_order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='main.bulkorder')),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='main.user')),
                ('fleet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='complimentary_bookings', to='main.fleet')),
            ],
            options={
                'ordering': ['-used_at'],
            },
        ),
        migrations.AddIndex(
            model_name='fleetcomplimentarybooking',
            index=models.Index(fields=['fleet', 'subscription_period_start'], name='fleetccomp_fleet_period'),
        ),
        migrations.AddIndex(
            model_name='fleetcomplimentarybooking',
            index=models.Index(fields=['branch', 'subscription_period_start'], name='fleetccomp_branch_period'),
        ),
    ]
