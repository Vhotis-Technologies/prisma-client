"""
Terms and privacy API: fetch latest Terms and Conditions and Privacy Policy (AllowAny).

Actions: get_terms, get_privacy_policy. Returns HTML content for in-app display.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from main.models import TermsAndConditions, PrivacyPolicy

class TermsView(APIView):
    permission_classes = [AllowAny]

    action_handler = {
        'get_terms': 'get_terms',
        'get_privacy_policy': 'get_privacy_policy',
    }

    def get(self, request, *args, **kwargs):
        """Route GET by action (get_terms, get_privacy_policy). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handler:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handler[action])
        return handler(request)

    def post(self, request, *args, **kwargs):
        """Route POST by action (same as get_terms/get_privacy_policy). Returns 400 if action invalid."""
        action = kwargs.get('action')
        if action not in self.action_handler:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        handler = getattr(self, self.action_handler[action])
        return handler(request)

    def get_terms(self, request):
        """Returns the latest Terms and Conditions from the TermsAndConditions model."""
        try:
            terms = TermsAndConditions.objects.latest('last_updated')

            # Styled HTML matching the Terms of Service modal: blue headings, grey body, numbered sections
            primary_blue = '#5B9BD5'
            text_dark = '#2C3E50'
            text_muted = '#6B7C8D'

            styled_html = f"""
            <html>
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {{
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }}
                    body {{
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background-color: transparent;
                        color: {text_muted};
                        font-size: 15px;
                        line-height: 1.6;
                        padding: 0;
                    }}
                    .terms-content {{
                        max-width: 100%;
                    }}
                    p {{
                        margin-bottom: 14px;
                        margin-top: 0;
                        color: {text_muted};
                        line-height: 1.6;
                        font-size: 15px;
                    }}
                    /* Numbered section headers (e.g. "3 - Terms and Conditions") - bold blue */
                    p strong:first-child {{
                        display: block;
                        font-size: 16px;
                        font-weight: bold;
                        margin-bottom: 8px;
                        margin-top: 18px;
                        color: {primary_blue};
                    }}
                    strong {{
                        font-weight: 600;
                        color: {text_dark};
                    }}
                    a {{
                        color: {primary_blue};
                        text-decoration: underline;
                    }}
                </style>
            </head>
            <body>
                <div class="terms-content">
                    {terms.content}
                </div>
            </body>
            </html>
            """
            return Response({
                'version': terms.version,
                'content': styled_html,
                'last_updated': terms.last_updated,
            })
        except TermsAndConditions.DoesNotExist:
            return Response({'error': 'Terms and Conditions not found'}, status=status.HTTP_404_NOT_FOUND)
    


    def get_privacy_policy(self, request):
        """Returns the latest Privacy Policy from the PrivacyPolicy model."""
        try:
            privacy_policy = PrivacyPolicy.objects.latest('last_updated')
            primary_blue = '#5B9BD5'
            text_dark = '#2C3E50'
            text_muted = '#6B7C8D'

            styled_html = f"""
            <html>
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {{
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }}
                    body {{
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background-color: transparent;
                        color: {text_muted};
                        font-size: 15px;
                        line-height: 1.6;
                        padding: 0;
                    }}
                    .privacy-content {{
                        max-width: 100%;
                    }}
                    h1 {{
                        font-size: 16px;
                        font-weight: bold;
                        margin-bottom: 14px;
                        color: {primary_blue};
                    }}
                    p {{
                        margin-bottom: 10px;
                        margin-top: 0;
                        color: {text_muted};
                        line-height: 1.6;
                        font-size: 10px;
                    }}
                    p strong:first-child {{
                        display: block;
                        font-size: 12px;
                        font-weight: bold;
                        margin-bottom: 8px;
                        margin-top: 18px;
                        color: {primary_blue};
                    }}
                    strong {{
                        font-weight: 600;
                        color: {text_dark};
                    }}
                    a {{
                        color: {primary_blue};
                        text-decoration: underline;
                    }}
                    ul, ol {{
                        margin-left: 20px;
                        margin-bottom: 14px;
                    }}
                    li {{
                        margin-bottom: 6px;
                    }}
                </style>
            </head>
            <body>
                <div class="privacy-content">
                    {privacy_policy.content}
                </div>
            </body>
            </html>
            """
            return Response({
                'version': privacy_policy.version,
                'content': styled_html,
                'last_updated': privacy_policy.last_updated,
            })
        except PrivacyPolicy.DoesNotExist:
            return Response({'error': 'Privacy Policy not found'}, status=status.HTTP_404_NOT_FOUND)