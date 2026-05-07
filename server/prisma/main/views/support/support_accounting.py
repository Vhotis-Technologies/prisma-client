"""
Monthly aggregates of PaymentTransaction for support accounting and PDF export.

**Auth:** ``SupportPermissionAccess`` (support server proxy + internal key).

**VAT assumptions:** Stored ``amount`` is VAT-inclusive where VAT applies.
Reduced rate 13.5%%: payment, b2c_subscription, reschedule_fee.
Standard rate 23%%: legacy vin_lookup (historic rows), fleet_subscription.
tip and refund: no VAT split (total equals amount sum).

Month boundaries use Django's active ``TIME_ZONE`` (see ``USE_TZ``).
"""
from __future__ import annotations

import io
from collections import defaultdict
from datetime import date, datetime, time
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from main.models import PaymentTransaction
from main.views.support.support_permission_access import SupportPermissionAccess

VAT_RATE_REDUCED = Decimal('0.135')
VAT_RATE_STANDARD = Decimal('0.23')

TRANSACTION_TYPES_ORDER = [choice[0] for choice in PaymentTransaction.TRANSACTION_TYPES]

TRANSACTION_LABEL = dict(PaymentTransaction.TRANSACTION_TYPES)


def _vat_rate_for_type(transaction_type: str) -> Decimal | None:
    if transaction_type in ('payment', 'b2c_subscription', 'reschedule_fee'):
        return VAT_RATE_REDUCED
    if transaction_type in ('vin_lookup', 'fleet_subscription'):
        return VAT_RATE_STANDARD
    return None


def _vat_rate_pdf_display(transaction_type: str) -> str:
    """Human-readable VAT %% for PDF table (e.g. 13.5 and 23.0, not 13.50 / 23.00)."""
    rate = _vat_rate_for_type(transaction_type)
    if rate is None:
        return '_'
    pct = (rate * Decimal('100')).quantize(Decimal('0.1'))
    return format(pct, 'f')


def _extract_vat_from_gross(gross: Decimal, rate: Decimal) -> tuple[Decimal, Decimal]:
    """Assume gross is VAT-inclusive. Returns (net, vat)."""
    one = Decimal('1')
    net = (gross / (one + rate)).quantize(Decimal('0.01'))
    vat = (gross - net).quantize(Decimal('0.01'))
    return net, vat


def _month_start(year: int, month: int) -> datetime:
    tz = timezone.get_current_timezone()
    d = date(year, month, 1)
    naive = datetime.combine(d, time.min)
    return timezone.make_aware(naive, tz)


def _next_month_start(year: int, month: int) -> datetime:
    if month == 12:
        return _month_start(year + 1, 1)
    return _month_start(year, month + 1)


def _parse_year_month(request):
    try:
        year = int(request.query_params.get('year', ''))
        month = int(request.query_params.get('month', ''))
    except (TypeError, ValueError):
        return None, None, Response({'error': 'Invalid year or month'}, status=status.HTTP_400_BAD_REQUEST)
    if year < 2000 or year > 2100 or month < 1 or month > 12:
        return None, None, Response({'error': 'year and month must be valid'}, status=status.HTTP_400_BAD_REQUEST)
    return year, month, None


def _serialize_decimal(d: Decimal) -> str:
    return format(d.quantize(Decimal('0.01')), 'f')


class SupportAccountingView(APIView):
    permission_classes = [SupportPermissionAccess]
    action_handler = {
        'get_monthly_summaries': '_get_monthly_summaries',
        'get_month_detail': '_get_month_detail',
        'export_month_pdf': '_export_month_pdf',
    }

    def perform_content_negotiation(self, request, force=False):
        """PDF is returned as Django HttpResponse; DRF would reject ``Accept: application/pdf`` otherwise."""
        if self.kwargs.get('action') == 'export_month_pdf':
            return JSONRenderer(), JSONRenderer.media_type
        return super().perform_content_negotiation(request, force)

    def get(self, request, *args, **kwargs):
        action = kwargs.get('action')
        if action not in self.action_handler:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handler[action])
        return handler(request)

    def _status_kw(self, request) -> str:
        raw = (request.query_params.get('status') or 'succeeded').strip().lower()
        if raw == 'all':
            return 'all'
        if raw in ('succeeded', 'failed', 'pending'):
            return raw
        return 'succeeded'

    def _filter_qs_for_month(self, year: int, month: int, status_kw: str):
        start = _month_start(year, month)
        end = _next_month_start(year, month)
        qs = PaymentTransaction.objects.filter(created_at__gte=start, created_at__lt=end)
        if status_kw != 'all':
            qs = qs.filter(status=status_kw)
        return qs

    def _aggregate_month(self, year: int, month: int, status_kw: str) -> dict:
        qs = self._filter_qs_for_month(year, month, status_kw)

        by_type: dict[str, dict] = {}
        for tt in TRANSACTION_TYPES_ORDER:
            sub = qs.filter(transaction_type=tt)
            agg = sub.aggregate(count=Count('id'), sum_amount=Sum('amount'))
            c = agg['count'] or 0
            s = agg['sum_amount'] if agg['sum_amount'] is not None else Decimal('0')
            by_type[tt] = {
                'count': c,
                'sum_amount': _serialize_decimal(Decimal(s)),
            }

        currency_totals: dict[str, dict] = {}
        for row in qs.values('currency').annotate(count=Count('id'), sum_amount=Sum('amount')):
            curr = (row['currency'] or 'eur').upper()
            s = row['sum_amount'] if row['sum_amount'] is not None else Decimal('0')
            currency_totals[curr] = {
                'count': row['count'],
                'grand_total': _serialize_decimal(Decimal(s)),
            }

        vat_by_currency = self._vat_summary_for_queryset(qs)

        year_month = f'{year}-{month:02d}'
        return {
            'year_month': year_month,
            'year': year,
            'month': month,
            'currency_totals': currency_totals,
            'by_transaction_type': by_type,
            'vat_by_currency': vat_by_currency,
        }

    def _vat_summary_for_queryset(self, qs):
        """Per currency: taxable net, VAT, and exempt totals (VAT-inclusive amounts)."""
        summary: dict[str, dict[str, Decimal]] = defaultdict(
            lambda: {
                'taxable_gross': Decimal('0'),
                'net_of_vat': Decimal('0'),
                'vat_amount': Decimal('0'),
                'exempt_total': Decimal('0'),
            }
        )
        for tx in qs.iterator(chunk_size=500):
            amt = Decimal(tx.amount)
            curr = (tx.currency or 'eur').upper()
            rate = _vat_rate_for_type(tx.transaction_type)
            if rate is None:
                summary[curr]['exempt_total'] += amt
            else:
                summary[curr]['taxable_gross'] += amt
                net, vat = _extract_vat_from_gross(amt, rate)
                summary[curr]['net_of_vat'] += net
                summary[curr]['vat_amount'] += vat

        out = {}
        for curr, values in summary.items():
            out[curr] = {k: _serialize_decimal(v) for k, v in values.items()}
        return out

    def _get_monthly_summaries(self, request):
        try:
            months_back = int(request.query_params.get('months_back', 24))
        except (TypeError, ValueError):
            months_back = 24
        months_back = max(1, min(months_back, 120))

        status_kw = self._status_kw(request)
        base = PaymentTransaction.objects.all()
        if status_kw != 'all':
            base = base.filter(status=status_kw)

        distinct_months = (
            base.annotate(m=TruncMonth('created_at'))
            .values('m')
            .annotate(cnt=Count('id'))
            .order_by('-m')[:months_back]
        )

        summaries = []
        for row in distinct_months:
            m = row['m']
            if m is None:
                continue
            summaries.append(self._aggregate_month(m.year, m.month, status_kw))

        return Response({'data': {'summaries': summaries}})

    def _get_month_detail(self, request):
        year, month, err = _parse_year_month(request)
        if err:
            return err

        status_kw = self._status_kw(request)
        qs = self._filter_qs_for_month(year, month, status_kw)
        summary = self._aggregate_month(year, month, status_kw)
        summary['transaction_count'] = qs.count()
        return Response({'data': summary})

    def _export_month_pdf(self, request):
        year, month, err = _parse_year_month(request)
        if err:
            return err

        status_kw = self._status_kw(request)
        summary = self._aggregate_month(year, month, status_kw)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, title=f'Accounting {year}-{month:02d}')
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph(
            f'Prisma Car Care Accounting Report For — {year}-{month:02d}',
            styles['Title'],
        ))
        story.append(Paragraph(
            f'This report is for VAT purposes only. All amounts are VAT-inclusive where VAT applies.',
            styles['Normal'],
        ))
        story.append(Spacer(1, 10))

        tz_label = str(timezone.get_current_timezone())
        story.append(Paragraph(f'Generated: {timezone.now().isoformat()} ({tz_label})', styles['Italic']))
        story.append(Spacer(1, 18))

        # Currency totals
        story.append(Paragraph('Totals by currency', styles['Heading2']))
        ct_rows = [['Currency', 'Transactions', 'Grand total']]
        for curr in sorted(summary['currency_totals'].keys()):
            row = summary['currency_totals'][curr]
            ct_rows.append([curr, str(row['count']), row['grand_total']])
        t_ct = Table(ct_rows, hAlign='LEFT')
        t_ct.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E5E7EB')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ]
            )
        )
        story.append(t_ct)
        story.append(Spacer(1, 14))

        story.append(Paragraph('VAT summary (VAT-inclusive gross split)', styles['Heading2']))
        vat_rows = [
            [
                'Currency',
                'Taxable gross',
                'Net',
                'VAT',
                'Exempt total',
            ]
        ]

        for curr in sorted(summary['vat_by_currency'].keys()):
            v = summary['vat_by_currency'][curr]
            vat_rows.append(
                [
                    curr,
                    v.get('taxable_gross', '0.00'),
                    v.get('net_of_vat', '0.00'),
                    v.get('vat_amount', '0.00'),
                    v.get('exempt_total', '0.00'),
                ]
            )
        if len(vat_rows) == 1:
            vat_rows.append(['—', '0.00', '0.00', '0.00', '0.00'])
        t_vat = Table(vat_rows, hAlign='LEFT')
        t_vat.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E5E7EB')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ]
            )
        )
        story.append(t_vat)
        story.append(Spacer(1, 18))

        story.append(Paragraph('By transaction type', styles['Heading2']))
        bt_rows = [['Type', 'Label', 'Count', 'Sum', 'Vat Rate']]
        for tt in TRANSACTION_TYPES_ORDER:
            row = summary['by_transaction_type'][tt]
            bt_rows.append(
                [
                    tt.isupper() and tt or tt.upper(),
                    TRANSACTION_LABEL.get(tt, tt),
                    str(row['count']),
                    row['sum_amount'],
                    _vat_rate_pdf_display(tt),
                ]
            )
        t_bt = Table(bt_rows, colWidths=[110, 140, 50, 70], hAlign='LEFT')
        t_bt.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E5E7EB')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(t_bt)
        story.append(Spacer(1, 14))

        story.append(Paragraph('Do not share this report with anyone outside the Prisma Car Care team.', styles['Italic']))

        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        filename = f'accounting_{year}_{month:02d}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
