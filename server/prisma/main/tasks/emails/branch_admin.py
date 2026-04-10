from celery import shared_task
from django.template.loader import render_to_string
from main.util.graph_mail import send_mail as graph_send_mail


@shared_task
def send_branch_admin_credentials_email(
    recipient_email,
    recipient_name,
    branch_name,
    branch_address,
    password,
    role_label="Branch Admin",
):
    """Send login credentials to a new branch admin or manager when the fleet owner creates their account."""
    try:
        subject = "Your Prisma Branch Account – Login Details"
        html_message = render_to_string("branch_admin_credentials.html", {
            "recipient_name": recipient_name,
            "recipient_email": recipient_email,
            "branch_name": branch_name or "—",
            "branch_address": branch_address,
            "password": password,
            "role_label": role_label,
        })
        graph_send_mail(subject, html_message, recipient_email)
        return f"Branch admin credentials email sent successfully to {recipient_email}"
    except Exception as e:
        return f"Failed to send branch admin credentials email: {str(e)}"
