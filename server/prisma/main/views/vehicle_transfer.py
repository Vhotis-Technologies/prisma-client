"""
Vehicle transfer web flow: approve or reject a transfer via email link (HTML pages).

WebTransferActionView: GET shows confirm/reject page; POST confirms or rejects. Sends
send_transfer_approved_email / send_transfer_rejected_email. AllowAny (token in URL).
"""
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from django.shortcuts import render
from main.models import VehicleTransfer
from main.util.vehicle_transfer_actions import (
    apply_vehicle_transfer_approval,
    apply_vehicle_transfer_rejection,
)


class WebTransferActionView(APIView):
    """
    Web view for vehicle transfer approval/rejection.
    Similar to password reset flow - renders HTML pages instead of JSON responses.
    """
    permission_classes = [AllowAny]
    
    def get(self, request, transfer_id):
        """Display the transfer confirmation page"""
        try:
            transfer = VehicleTransfer.objects.select_related('vehicle', 'from_owner', 'to_owner').get(id=transfer_id)
            
            # Check if transfer can still be processed
            if transfer.status != 'pending':
                return render(request, 'transfer_invalid.html', {
                    'error': f'This transfer request is {transfer.status} and cannot be processed',
                    'transfer': transfer
                })
            
            if transfer.is_expired():
                transfer.status = 'expired'
                transfer.save()
                return render(request, 'transfer_invalid.html', {
                    'error': 'This transfer request has expired',
                    'transfer': transfer
                })
            
            # Show confirmation page with vehicle details
            return render(request, 'transfer_action_confirm.html', {
                'transfer': transfer,
                'vehicle': transfer.vehicle,
                'requester': transfer.to_owner,
                'owner': transfer.from_owner,
                'expires_at': transfer.expires_at,
            })
            
        except VehicleTransfer.DoesNotExist:
            return render(request, 'transfer_invalid.html', {
                'error': 'Transfer request not found'
            })
        except Exception as e:
            return render(request, 'transfer_invalid.html', {
                'error': f'An error occurred: {str(e)}'
            })
    

    def post(self, request, transfer_id):
        """Process the transfer approval or rejection"""
        action = request.POST.get('action', '').strip().lower()
        
        if action not in ['approve', 'reject']:
            return render(request, 'transfer_invalid.html', {
                'error': 'Invalid action. Please use approve or reject.'
            })
        
        try:
            transfer = VehicleTransfer.objects.select_related('vehicle', 'from_owner', 'to_owner').get(id=transfer_id)
            
            # Validate transfer status
            if transfer.status != 'pending':
                return render(request, 'transfer_invalid.html', {
                    'error': f'This transfer request is {transfer.status} and cannot be processed',
                    'transfer': transfer
                })
            
            if transfer.is_expired():
                transfer.status = 'expired'
                transfer.save()
                return render(request, 'transfer_invalid.html', {
                    'error': 'This transfer request has expired',
                    'transfer': transfer
                })
            
            if action == 'approve':
                return self._process_approval(request, transfer)
            else:
                return self._process_rejection(request, transfer)
                
        except VehicleTransfer.DoesNotExist:
            return render(request, 'transfer_invalid.html', {
                'error': 'Transfer request not found'
            })
        except Exception as e:
            return render(request, 'transfer_invalid.html', {
                'error': f'An error occurred: {str(e)}'
            })
    

    def _process_approval(self, request, transfer):
        """Process transfer approval"""
        try:
            err = apply_vehicle_transfer_approval(transfer)
            if err:
                return render(request, 'transfer_invalid.html', {
                    'error': err,
                    'transfer': transfer
                })
            return render(request, 'transfer_approve_success.html', {
                'transfer': transfer,
                'vehicle': transfer.vehicle,
                'requester': transfer.to_owner,
                'owner': transfer.from_owner,
            })
        except Exception as e:
            return render(request, 'transfer_invalid.html', {
                'error': f'Failed to approve transfer: {str(e)}',
                'transfer': transfer
            })

            
    
    def _process_rejection(self, request, transfer):
        """Process transfer rejection. If already expired, set status to expired and skip rejected email."""
        try:
            err = apply_vehicle_transfer_rejection(transfer)
            if err:
                return render(request, 'transfer_invalid.html', {
                    'error': err,
                    'transfer': transfer
                })
            return render(request, 'transfer_reject_success.html', {
                'transfer': transfer,
                'vehicle': transfer.vehicle,
                'requester': transfer.to_owner,
                'owner': transfer.from_owner,
            })
        except Exception as e:
            return render(request, 'transfer_invalid.html', {
                'error': f'Failed to reject transfer: {str(e)}',
                'transfer': transfer
            })
