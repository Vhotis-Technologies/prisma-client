"""
Microsoft Graph API client for sending email (e.g. support@prismavalet.com).

Uses MSAL client-credentials flow; ``get_access_token`` and ``send_mail`` call Graph.
Requires ``GRAPH_CLIENT_ID``, ``GRAPH_CLIENT_SECRET``, ``GRAPH_TENANT_ID``, ``GRAPH_USER``.
"""
import base64
import os
import requests
import msal

GRAPH_API_ENDPOINT = os.getenv("GRAPH_API_ENDPOINT", "https://graph.microsoft.com/v1.0")
CLIENT_ID = os.getenv("GRAPH_CLIENT_ID")
CLIENT_SECRET = os.getenv("GRAPH_CLIENT_SECRET")
TENANT_ID = os.getenv("GRAPH_TENANT_ID")
USER = os.getenv("GRAPH_USER")  # support@prismavalet.com


def get_access_token():
    """
    Acquire a Microsoft Graph access token via MSAL (silent cache or client credentials).

    Returns:
        str: Bearer token for Graph API requests.

    Raises:
        Exception: When token acquisition fails (includes MSAL error description).
    """
    authority = f"https://login.microsoftonline.com/{TENANT_ID}"
    app = msal.ConfidentialClientApplication(
        CLIENT_ID, authority=authority, client_credential=CLIENT_SECRET
    )

    # Prefer cached token from a prior acquisition in-process.
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
        raise Exception(
            f"Failed to acquire access token: {result.get('error')}, {result.get('error_description')}"
        )


def send_mail(subject, body_html, recipient):
    """
    Send an HTML email as the configured Graph mailbox user.

    Args:
        subject: Email subject line.
        body_html: HTML body content.
        recipient: To-address string.

    Returns:
        bool: True when Graph returns HTTP 202 Accepted.

    Raises:
        Exception: On non-202 Graph API responses (includes response body).
    """
    return send_mail_with_attachments(subject, body_html, recipient)


def send_mail_with_attachments(subject, body_html, recipient, attachments=None):
    """
    Send HTML email with optional file attachments via Microsoft Graph.

    Args:
        subject: Email subject line.
        body_html: HTML body content.
        recipient: To-address string.
        attachments: Optional list of dicts with keys ``name``, ``content_type``,
            ``content_bytes`` (raw bytes).

    Returns:
        bool: True when Graph returns HTTP 202 Accepted.

    Raises:
        Exception: On non-202 Graph API responses (includes response body).
    """
    access_token = get_access_token()
    headers = {"Authorization": f"Bearer {access_token}"}
    message = {
        "subject": subject,
        "body": {"contentType": "HTML", "content": body_html},
        "toRecipients": [{"emailAddress": {"address": recipient}}],
    }
    if attachments:
        message["attachments"] = [
            {
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": item["name"],
                "contentType": item.get("content_type", "application/octet-stream"),
                "contentBytes": base64.b64encode(item["content_bytes"]).decode("ascii"),
            }
            for item in attachments
        ]
    email_msg = {"message": message}

    response = requests.post(
        f"{GRAPH_API_ENDPOINT}/users/{USER}/sendMail",
        headers=headers,
        json=email_msg,
    )

    if response.status_code == 202:
        return True
    else:
        raise Exception(f"Graph API error {response.status_code}: {response.text}")
