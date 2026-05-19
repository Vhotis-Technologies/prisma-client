"""Serialize BulkOrder rows for invoice list APIs."""


def serialize_bulk_order_invoice_list(bulk_orders):
    invoices = []
    for bulk_order in bulk_orders:
        invoices.append({
            'id': str(bulk_order.id),
            'booking_reference': bulk_order.booking_reference or '',
            'invoice_id': bulk_order.stripe_invoice_id or None,
            'payment_status': bulk_order.payment_status or '',
            'total_amount': float(bulk_order.total_amount) if bulk_order.total_amount is not None else None,
            'currency': 'eur',
            'number_of_vehicles': bulk_order.number_of_vehicles or 0,
            'created_at': bulk_order.created_at.isoformat() if bulk_order.created_at else None,
            'created_by': {
                'id': str(bulk_order.user.id) if bulk_order.user else None,
                'name': bulk_order.user.name if bulk_order.user else None,
                'email': bulk_order.user.email if bulk_order.user else None,
            },
            'branch': {
                'id': str(bulk_order.branch.id) if bulk_order.branch else None,
                'name': bulk_order.branch.name if bulk_order.branch else None,
            },
        })
    return invoices
