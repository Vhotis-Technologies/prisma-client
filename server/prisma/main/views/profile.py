"""
Profile API: addresses CRUD, profile get/update, push/email/marketing notification tokens.

Actions: get_addresses, add_new_address, update_address, delete_address,
update_push_notification_token, update_email_notification_token, update_marketing_email_token, get_profile.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from main.models import Address, BookedAppointment, User, Fleet, Branch, FleetMember

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    """ Define a set of action handlers that would be used to route the url to the appropriate function """
    action_handlers = {
        "get_addresses": "get_addresses",
        "add_new_address": "add_address",
        "update_address": "update_address",
        "delete_address": "delete_address",
        'update_push_notification_token': 'update_push_notification_token',
        'update_email_notification_token': 'update_email_notification_token',
        'update_marketing_email_token': 'update_marketing_email_token',
        'get_profile': 'get_profile',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action (e.g. get_addresses, get_profile). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    def post(self, request, *args, **kwargs):
        """Route POST by action (e.g. add_new_address). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    

    def patch(self, request, *args, **kwargs):
        """Route PATCH by action (e.g. update_address, update_*_token). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    

    def delete(self, request, *args, **kwargs):
        """Route DELETE by action (e.g. delete_address). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handlers:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        handler = getattr(self, self.action_handlers[action])
        return handler(request)
    
    """ The functions defined here are the functions that will be used to hanlde different actions that are defined in the action handlers """

    def add_address(self, request):
        """ Add a new address to the user's profile.
        ARGS
            request: The request object which contains the address data
            {
                "address": "123 Main St",
                "post_code": "12345",
                "city": "Anytown",
                "country": "USA"
            }
        RETURNS:
            A response object containing the saved address data matching MyAddressProps interface
            {
                "id": "address-id",
                "address": "123 Main St",
                "post_code": "12345",
                "city": "Anytown",
                "country": "USA"
            }
        """
        try:
            address = request.data.get('address')
            post_code = request.data.get('post_code') or ''
            city = request.data.get('city')
            country = request.data.get('country')

            # Validate required fields (post_code is optional)
            if not all([address, city, country]):
                return Response(
                    {'error': 'Address, city, and country are required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Parse optional latitude and longitude
            latitude = request.data.get('latitude')
            longitude = request.data.get('longitude')
            if latitude is not None:
                try:
                    latitude = float(latitude)
                    if not -90 <= latitude <= 90:
                        latitude = None
                except (TypeError, ValueError):
                    latitude = None
            if longitude is not None:
                try:
                    longitude = float(longitude)
                    if not -180 <= longitude <= 180:
                        longitude = None
                except (TypeError, ValueError):
                    longitude = None

            # Create a new address object and save the address to the database
            new_address = Address.objects.create(
                address=address,
                post_code=post_code,
                city=city,
                country=country,
                latitude=latitude,
                longitude=longitude,
                user=request.user
            )
            new_address.save()
            
            # Return the saved address data matching MyAddressProps interface
            return Response({
                'id': str(new_address.id),
                'address': new_address.address,
                'post_code': new_address.post_code,
                'city': new_address.city,
                'country': new_address.country,
                'latitude': new_address.latitude,
                'longitude': new_address.longitude
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


    def update_address(self, request):
        """ Update an existing address in the user's profile.
        ARGS
            request: The request object which contains the address data
            {
                "address": "123 Main St",
                "post_code":     "12345",
                "city": "Anytown",
                "country": "USA"
            }
            and also the id of the address to update
        RETURNS:
            A message indicating that the address was updated successfully
        """
        try:
            address = request.data.get('address')
            post_code = request.data.get('post_code')
            city = request.data.get('city')
            country = request.data.get('country')
            id = request.data.get('id')
            
            # Get the address object to be updated using the id and the user object
            # Return an error if the address is not found 
            try:
                address_to_update = Address.objects.get(id=id, user=request.user)
            except Address.DoesNotExist:
                return Response({'error': 'Address not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Update the address object with the new data or the old data if no new data is provided
            address_to_update.address = address if address else address_to_update.address
            address_to_update.post_code = post_code if post_code else address_to_update.post_code
            address_to_update.city = city if city else address_to_update.city
            address_to_update.country = country if country else address_to_update.country

            # Update optional latitude and longitude
            latitude = request.data.get('latitude')
            longitude = request.data.get('longitude')
            if latitude is not None:
                try:
                    lat_val = float(latitude)
                    if -90 <= lat_val <= 90:
                        address_to_update.latitude = lat_val
                except (TypeError, ValueError):
                    pass
            if longitude is not None:
                try:
                    lon_val = float(longitude)
                    if -180 <= lon_val <= 180:
                        address_to_update.longitude = lon_val
                except (TypeError, ValueError):
                    pass

            # Save the updated address object
            address_to_update.save()
            return Response({
                'id': str(address_to_update.id),
                'address': address_to_update.address,
                'post_code': address_to_update.post_code,
                'city': address_to_update.city,
                'country': address_to_update.country,
                'latitude': float(address_to_update.latitude) if address_to_update.latitude else None,
                'longitude': float(address_to_update.longitude) if address_to_update.longitude else None,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
        
    def delete_address(self, request):
        """ Delete an existing address from the user's profile.
        ARGS
            request: The request object which contains the id of the address to delete
        RETURNS:
            A message indicating that the address was deleted successfully
        """
        try:
            id = request.data.get('id')
            # Get the address object to be deleted using the id and the user object
            # Return an error if the address is not found 
            try:
                address_to_delete = Address.objects.get(id=id, user=request.user)
            except Address.DoesNotExist:
                return Response({'error': 'Address not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Delete the address object
            address_to_delete.delete()
            return Response({'id': id, 'message': 'Address deleted successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        

    def get_addresses(self, request):
        """ Get all the addresses for the user.
        For fleet owners: Returns addresses from all their fleet branches
        For fleet admins: Returns address from their managed branch
        For regular users: Returns their saved addresses
        
        RETURNS:
            A response object containing the data of the action to route the url to the appropriate function
            {
                "addresses": [
                    {
                        "id": "123",
                        "address": "123 Main St",
                        "post_code": "12345",
                        "city": "Anytown",
                        "country": "USA"
                    }
                ]
            }
        """
        try:
            addresses_list = []
            
            # Check if user is a fleet owner
            if request.user.is_fleet_owner:
                # Get all branches from the fleet owner's fleet
                fleet = Fleet.objects.filter(owner=request.user).first()
                if fleet:
                    branches = Branch.objects.filter(fleet=fleet)
                    for branch in branches:
                        addresses_list.append({
                            'id': str(branch.id),
                            'address': branch.address or '',
                            'post_code': branch.postcode or '',
                            'city': branch.city or '',
                            'country': branch.country or '',
                            'latitude': None,
                            'longitude': None
                        })
            
            # Check if user is a fleet admin (branch admin)
            elif request.user.is_branch_admin:
                # Get the managed branch for the fleet admin
                branch = request.user.get_managed_branch()
                if branch:
                    addresses_list.append({
                        'id': str(branch.id),
                        'address': branch.address or '',
                        'post_code': branch.postcode or '',
                        'city': branch.city or '',
                        'country': branch.country or '',
                        'latitude': None,
                        'longitude': None
                    })
            
            # For regular users, return their saved addresses
            else:
                # Get all the addresses for the user
                addresses = Address.objects.filter(user=request.user)
                for address in addresses:
                    addresses_list.append({
                        'id': str(address.id),
                        'address': address.address,
                        'post_code': address.post_code,
                        'city': address.city,
                        'country': address.country,
                        'latitude': float(address.latitude) if address.latitude else None,
                        'longitude': float(address.longitude) if address.longitude else None
                    })
            
            return Response({'addresses': addresses_list}, status=status.HTTP_200_OK)
        
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        

    def update_push_notification_token(self, request):
        """Update user's FCM/push notification token. Expects request.data.allow_push (bool) and optional request.data.token."""
        try:
            update_value = request.data.get('update')
            
            if update_value is None:
                return Response(
                    {'error': 'Update value is required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            request.user.allow_push_notifications = update_value
            request.user.save()
            
            return Response({
                'success': True,
                'message': 'Push notification setting updated successfully',
                'value': update_value
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)



    def update_email_notification_token(self, request):
        """Update user's allow_email_notifications flag. Expects request.data.allow_email (bool)."""
        try:
            update_value = request.data.get('update')
            
            if update_value is None:
                return Response(
                    {'error': 'Update value is required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Update the user's email notification setting
            request.user.allow_email_notifications = update_value
            request.user.save()
            
            return Response({
                'success': True,
                'message': 'Email notification setting updated successfully',
                'value': update_value
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)



    def update_marketing_email_token(self, request):
        """Update user's allow_marketing_emails flag. Expects request.data.allow_marketing (bool)."""
        try:
            update_value = request.data.get('update')
            
            if update_value is None:
                return Response(
                    {'error': 'Update value is required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Update the user's marketing email setting
            request.user.allow_marketing_emails = update_value
            request.user.save()
            
            return Response({
                'success': True,
                'message': 'Marketing email setting updated successfully',
                'value': update_value
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    

    def get_profile(self, request):
        """
        Return full profile for the authenticated user: user fields, addresses, loyalty, managed_branch (if branch admin),
        partner info (if dealership), recent service count, referral_code.
        """
        try:
            # Get the user's profile
            user = request.user
            
            # Get user's address if exists
            address = Address.objects.filter(user=user).first()
            
            # Get user's loyalty program if exists
            from main.models import LoyaltyProgram
            loyalty = (
                LoyaltyProgram.objects.filter(user=user).first()
                if user.is_b2c_user()
                else None
            )
            loyalty_benefits = loyalty.get_tier_benefits() if loyalty else None
            
            from main.models import Partner
            try:
                partner_profile = user.partner_profile
                is_dealership = partner_profile is not None
                partner_referral_code = partner_profile.referral_code if is_dealership else None
                partner_business_name = partner_profile.business_name if is_dealership else None
            except Partner.DoesNotExist:
                is_dealership = False
                partner_referral_code = None
                partner_business_name = None

            user_profile = {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'is_fleet_owner': user.is_fleet_owner,
                'is_branch_admin': user.is_branch_admin,
                'is_dealership': is_dealership,
                'partner_referral_code': partner_referral_code,
                'business_name': partner_business_name,
                'address': {
                    'address': address.address if address else '',
                    'post_code': address.post_code if address else '',
                    'city': address.city if address else '',
                    'country': address.country if address else '',
                },
                'push_notification_token': user.allow_push_notifications,
                'email_notification_token': user.allow_email_notifications,
                'marketing_email_token': user.allow_marketing_emails,
                'loyalty_tier': loyalty.current_tier if loyalty else '',
                'loyalty_benefits': loyalty_benefits,
                'referral_code': user.referral_code if user.referral_code else '',
            }
            return Response({'profile': user_profile}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)