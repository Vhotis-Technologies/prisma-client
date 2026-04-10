"""
Fleet analytics utilities for dashboard metrics.
"""
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Sum, Count, Avg, Q, F
from django.db.models.functions import Coalesce, TruncDate, TruncWeek, TruncMonth
from collections import defaultdict

from main.models import (
    Fleet, Branch, FleetVehicle, BookedAppointment, 
    PaymentTransaction, RefundRecord, EventDataManagement, FleetMember
)
from main.utils.branch_spend import get_branch_spend_for_period


def get_branch_performance(fleet: Fleet, start_date: datetime, end_date: datetime):
    """
    Calculate branch performance metrics: spend, bookings, average booking value per branch.
    
    Returns list of dicts with branch performance data.
    """
    branches = Branch.objects.filter(fleet=fleet)
    performance_data = []
    
    for branch in branches:
        # Get branch vehicles
        branch_vehicles = FleetVehicle.objects.filter(fleet=fleet, branch=branch)
        vehicle_ids = [bv.vehicle.id for bv in branch_vehicles]
        
        # Get bookings in date range
        branch_bookings = BookedAppointment.objects.filter(
            vehicle_id__in=vehicle_ids,
            appointment_date__gte=start_date.date(),
            appointment_date__lte=end_date.date(),
        )
        
        booking_count = branch_bookings.count()
        
        # Calculate spend (net payments - refunds)
        admin_ids = list(
            FleetMember.objects.filter(branch=branch).values_list('user_id', flat=True)
        )
        
        if admin_ids:
            # Payments
            payments = PaymentTransaction.objects.filter(
                transaction_type='payment',
                status='succeeded',
                booking__user_id__in=admin_ids,
                booking__isnull=False,
                created_at__gte=start_date,
                created_at__lte=end_date,
            )
            payments_sum = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
            
            # Refunds
            refunds = (
                RefundRecord.objects.filter(
                    booking__user_id__in=admin_ids,
                    status='succeeded',
                )
                .annotate(effective_date=Coalesce(F('processed_at'), F('created_at')))
                .filter(
                    effective_date__gte=start_date,
                    effective_date__lte=end_date,
                )
            )
            refunds_sum = refunds.aggregate(total=Sum('requested_amount'))['total'] or Decimal('0')
            
            total_spend = float(payments_sum - refunds_sum)
        else:
            total_spend = 0.0
        
        # Calculate average booking value
        avg_booking_value = 0.0
        if booking_count > 0:
            total_amount = branch_bookings.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
            avg_booking_value = float(total_amount / booking_count)
        
        performance_data.append({
            'branch_id': str(branch.id),
            'branch_name': branch.name,
            'total_spend': max(0.0, total_spend),
            'booking_count': booking_count,
            'avg_booking_value': avg_booking_value,
        })
    
    # Sort by total_spend descending
    performance_data.sort(key=lambda x: x['total_spend'], reverse=True)
    
    return performance_data


def get_spend_trends(fleet: Fleet, start_date: datetime, end_date: datetime, granularity='daily'):
    """
    Get time-series spend data per branch.
    
    granularity: 'daily', 'weekly', or 'monthly'
    Returns dict with branch_id as key and list of {date, value} as value.
    """
    branches = Branch.objects.filter(fleet=fleet)
    trends_data = {}
    
    for branch in branches:
        admin_ids = list(
            FleetMember.objects.filter(branch=branch).values_list('user_id', flat=True)
        )
        
        if not admin_ids:
            trends_data[str(branch.id)] = {
                'branch_name': branch.name,
                'data': []
            }
            continue
        
        # Payments
        payments_qs = PaymentTransaction.objects.filter(
            transaction_type='payment',
            status='succeeded',
            booking__user_id__in=admin_ids,
            booking__isnull=False,
            created_at__gte=start_date,
            created_at__lte=end_date,
        )
        
        # Refunds
        refunds_qs = (
            RefundRecord.objects.filter(
                booking__user_id__in=admin_ids,
                status='succeeded',
            )
            .annotate(effective_date=Coalesce(F('processed_at'), F('created_at')))
            .filter(
                effective_date__gte=start_date,
                effective_date__lte=end_date,
            )
        )
        
        # Group by time period
        if granularity == 'daily':
            payments_grouped = payments_qs.annotate(date=TruncDate('created_at')).values('date').annotate(total=Sum('amount'))
            refunds_grouped = refunds_qs.annotate(date=TruncDate('effective_date')).values('date').annotate(total=Sum('requested_amount'))
        elif granularity == 'weekly':
            payments_grouped = payments_qs.annotate(date=TruncWeek('created_at')).values('date').annotate(total=Sum('amount'))
            refunds_grouped = refunds_qs.annotate(date=TruncWeek('effective_date')).values('date').annotate(total=Sum('requested_amount'))
        else:  # monthly
            payments_grouped = payments_qs.annotate(date=TruncMonth('created_at')).values('date').annotate(total=Sum('amount'))
            refunds_grouped = refunds_qs.annotate(date=TruncMonth('effective_date')).values('date').annotate(total=Sum('requested_amount'))
        
        # Combine payments and refunds
        spend_by_date = defaultdict(lambda: {'payments': Decimal('0'), 'refunds': Decimal('0')})
        
        for item in payments_grouped:
            date_key = item['date'].isoformat() if item['date'] else None
            if date_key:
                spend_by_date[date_key]['payments'] += item['total'] or Decimal('0')
        
        for item in refunds_grouped:
            date_key = item['date'].isoformat() if item['date'] else None
            if date_key:
                spend_by_date[date_key]['refunds'] += item['total'] or Decimal('0')
        
        # Convert to list format
        trend_points = []
        for date_str in sorted(spend_by_date.keys()):
            net_spend = spend_by_date[date_str]['payments'] - spend_by_date[date_str]['refunds']
            trend_points.append({
                'date': date_str,
                'value': float(max(Decimal('0'), net_spend))
            })
        
        trends_data[str(branch.id)] = {
            'branch_name': branch.name,
            'data': trend_points
        }
    
    return trends_data


def calculate_health_score(inspection):
    """
    Calculate health score (0-100) from inspection data.
    """
    if not inspection:
        return None
    
    statuses = [
        inspection.wiper_status,
        inspection.oil_level,
        inspection.coolant_level,
        inspection.brake_fluid_level,
        inspection.battery_condition,
        inspection.headlights_status,
        inspection.taillights_status,
        inspection.indicators_status,
    ]
    
    valid_statuses = [s for s in statuses if s is not None and s != '']
    if len(valid_statuses) == 0:
        return None
    
    good_statuses = [
        s for s in valid_statuses
        if s in ('good', 'working', 'needs_change')  # needs_change is acceptable for fluids
    ]
    
    score = round((len(good_statuses) / len(valid_statuses)) * 100)
    return score


def get_vehicle_health_scores(fleet: Fleet, start_date: datetime, end_date: datetime):
    """
    Get aggregated vehicle health scores per branch and per vehicle.
    Returns dict with branch_id and vehicle_id as keys.
    """
    branches = Branch.objects.filter(fleet=fleet)
    health_data = {
        'by_branch': {},
        'by_vehicle': {}
    }
    
    for branch in branches:
        branch_vehicles = FleetVehicle.objects.filter(fleet=fleet, branch=branch)
        vehicle_ids = [bv.vehicle.id for bv in branch_vehicles]
        
        # Get bookings with inspections in date range
        bookings = BookedAppointment.objects.filter(
            vehicle_id__in=vehicle_ids,
            appointment_date__gte=start_date.date(),
            appointment_date__lte=end_date.date(),
            status='completed',
        ).select_related('eventdatamanagement')
        
        branch_scores = []
        vehicle_scores_map = defaultdict(list)
        
        for booking in bookings:
            if hasattr(booking, 'eventdatamanagement'):
                inspection = booking.eventdatamanagement
                score = calculate_health_score(inspection)
                
                if score is not None:
                    branch_scores.append(score)
                    vehicle_scores_map[str(booking.vehicle.id)].append(score)
        
        # Calculate average for branch
        avg_branch_score = sum(branch_scores) / len(branch_scores) if branch_scores else None
        
        health_data['by_branch'][str(branch.id)] = {
            'branch_name': branch.name,
            'avg_score': round(avg_branch_score, 1) if avg_branch_score else None,
            'inspection_count': len(branch_scores),
        }
        
        # Calculate average for each vehicle
        for vehicle_id, scores in vehicle_scores_map.items():
            avg_score = sum(scores) / len(scores) if scores else None
            health_data['by_vehicle'][vehicle_id] = {
                'avg_score': round(avg_score, 1) if avg_score else None,
                'inspection_count': len(scores),
            }
    
    return health_data


def get_booking_activity(fleet: Fleet, start_date: datetime, end_date: datetime):
    """
    Get booking counts by status and service type per branch.
    """
    branches = Branch.objects.filter(fleet=fleet)
    activity_data = {}
    
    for branch in branches:
        branch_vehicles = FleetVehicle.objects.filter(fleet=fleet, branch=branch)
        vehicle_ids = [bv.vehicle.id for bv in branch_vehicles]
        
        bookings = BookedAppointment.objects.filter(
            vehicle_id__in=vehicle_ids,
            appointment_date__gte=start_date.date(),
            appointment_date__lte=end_date.date(),
        )
        
        # Count by status
        status_counts = bookings.values('status').annotate(count=Count('id'))
        status_breakdown = {item['status']: item['count'] for item in status_counts}
        
        # Count by service type
        service_type_counts = bookings.values('service_type__name').annotate(count=Count('id'))
        service_breakdown = {item['service_type__name']: item['count'] for item in service_type_counts}
        
        activity_data[str(branch.id)] = {
            'branch_name': branch.name,
            'by_status': status_breakdown,
            'by_service_type': service_breakdown,
            'total': bookings.count(),
        }
    
    return activity_data


def get_common_issues(fleet: Fleet, start_date: datetime, end_date: datetime):
    """
    Get most frequent inspection issues across fleet.
    Returns dict with issue type and count.
    """
    branches = Branch.objects.filter(fleet=fleet)
    all_vehicle_ids = []
    
    for branch in branches:
        branch_vehicles = FleetVehicle.objects.filter(fleet=fleet, branch=branch)
        vehicle_ids = [bv.vehicle.id for bv in branch_vehicles]
        all_vehicle_ids.extend(vehicle_ids)
    
    # Get all inspections in date range
    bookings = BookedAppointment.objects.filter(
        vehicle_id__in=all_vehicle_ids,
        appointment_date__gte=start_date.date(),
        appointment_date__lte=end_date.date(),
        status='completed',
    ).select_related('eventdatamanagement')
    
    issues = {
        'battery_issues': 0,
        'tire_issues': 0,
        'fluid_issues': 0,
        'light_issues': 0,
        'wiper_issues': 0,
    }
    
    for booking in bookings:
        if hasattr(booking, 'eventdatamanagement'):
            inspection = booking.eventdatamanagement
            
            # Battery issues
            if inspection.battery_condition in ('weak', 'replace'):
                issues['battery_issues'] += 1
            
            # Tire issues
            if inspection.tire_condition and ('bad' in inspection.tire_condition.lower() or 'worn' in inspection.tire_condition.lower()):
                issues['tire_issues'] += 1
            if inspection.tire_tread_depth and inspection.tire_tread_depth < 3.0:  # Less than 3mm
                issues['tire_issues'] += 1
            
            # Fluid issues
            if inspection.oil_level in ('low', 'needs_refill'):
                issues['fluid_issues'] += 1
            if inspection.coolant_level in ('low', 'needs_refill'):
                issues['fluid_issues'] += 1
            if inspection.brake_fluid_level in ('low', 'needs_refill'):
                issues['fluid_issues'] += 1
            
            # Light issues
            if inspection.headlights_status in ('dim', 'not_working'):
                issues['light_issues'] += 1
            if inspection.taillights_status in ('dim', 'not_working'):
                issues['light_issues'] += 1
            if inspection.indicators_status == 'not_working':
                issues['light_issues'] += 1
            
            # Wiper issues
            if inspection.wiper_status in ('needs_work', 'bad'):
                issues['wiper_issues'] += 1
    
    # Convert to list format sorted by count
    issues_list = [
        {'type': 'Battery Issues', 'count': issues['battery_issues']},
        {'type': 'Tire Issues', 'count': issues['tire_issues']},
        {'type': 'Fluid Issues', 'count': issues['fluid_issues']},
        {'type': 'Light Issues', 'count': issues['light_issues']},
        {'type': 'Wiper Issues', 'count': issues['wiper_issues']},
    ]
    
    issues_list.sort(key=lambda x: x['count'], reverse=True)
    
    return issues_list
