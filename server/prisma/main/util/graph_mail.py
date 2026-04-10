"""
Microsoft Graph API client for sending email (e.g. support@prismavalet.com).

Uses MSAL for client credentials; get_access_token, send_mail via Graph API.
Requires GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_TENANT_ID, GRAPH_USER env vars.
"""
import os
import requests
import msal

GRAPH_API_ENDPOINT = os.getenv("GRAPH_API_ENDPOINT", "https://graph.microsoft.com/v1.0")
CLIENT_ID = os.getenv("GRAPH_CLIENT_ID")
CLIENT_SECRET = os.getenv("GRAPH_CLIENT_SECRET")
TENANT_ID = os.getenv("GRAPH_TENANT_ID")
USER = os.getenv("GRAPH_USER")  # support@prismavalet.com


def get_access_token():
    authority = f"https://login.microsoftonline.com/{TENANT_ID}"
    app = msal.ConfidentialClientApplication(
        CLIENT_ID, authority=authority, client_credential=CLIENT_SECRET
    )

    result = app.acquire_token_silent(
        ["https://graph.microsoft.com/.default"], account=None
    )

    if not result:
        result = app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )

    if "access_token" in result:
        return result["access_token"]
    else:
        # Provide more helpful error message
        raise Exception(
            f"Failed to acquire access token: {result.get('error')}, {result.get('error_description')}"
        )



def send_mail(subject, body_html, recipient):
    access_token = get_access_token()
    headers = {"Authorization": f"Bearer {access_token}"}
    email_msg = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body_html},
            "toRecipients": [{"emailAddress": {"address": recipient}}],
        }
    }

    response = requests.post(
        f"{GRAPH_API_ENDPOINT}/users/{USER}/sendMail",
        headers=headers,
        json=email_msg,
    )

    if response.status_code == 202:
        return True
    else:
        raise Exception(f"Graph API error {response.status_code}: {response.text}")
