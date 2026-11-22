import base64
import binascii
import hashlib
import hmac
import json
import os
from email.message import EmailMessage
from typing import Any
from urllib.parse import urlparse

import boto3
import httpx
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from starlette.concurrency import run_in_threadpool

app = FastAPI(title="Zenbook Email API", version="2.0.0")


class Attachment(BaseModel):
    filename: str
    contentType: str
    contentBase64: str


class SendEmailRequest(BaseModel):
    to: list[EmailStr]
    cc: list[EmailStr] = Field(default_factory=list)
    bcc: list[EmailStr] = Field(default_factory=list)
    subject: str
    text: str
    html: str
    attachments: list[Attachment] = Field(default_factory=list)
    idempotencyKey: str
    invoiceId: str | None = None


def env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def configured_providers() -> dict[str, bool]:
    return {"ses": bool(env("EMAIL_FROM") and env("AWS_REGION"))}


def sanitize_error(error: BaseException) -> str:
    message = str(error).replace("\n", " ").strip()
    return message[:300] or error.__class__.__name__


def decode_attachments(attachments: list[Attachment]) -> list[tuple[str, str, bytes]]:
    decoded: list[tuple[str, str, bytes]] = []
    for attachment in attachments:
        payload = "".join(attachment.contentBase64.split())
        try:
            content = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(status_code=400, detail=f"Invalid attachment encoding: {attachment.filename}") from error
        decoded.append((attachment.filename, attachment.contentType, content))
    return decoded


def require_invoice_pdf(attachments: list[tuple[str, str, bytes]]) -> None:
    pdfs = [
        attachment for attachment in attachments
        if attachment[1].lower().split(";", 1)[0].strip() == "application/pdf"
        and attachment[2].startswith(b"%PDF-")
    ]
    if not pdfs:
        raise HTTPException(status_code=400, detail="A valid PDF invoice attachment is required.")


def build_message(request: SendEmailRequest, sender: str, attachments: list[tuple[str, str, bytes]]) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(request.to)
    if request.cc:
        message["Cc"] = ", ".join(request.cc)
    message["Subject"] = request.subject
    message["Message-ID"] = f"<{hashlib.sha256(request.idempotencyKey.encode()).hexdigest()}@zenbook.invoice>"
    message.set_content(request.text)
    message.add_alternative(request.html, subtype="html")

    for filename, content_type, content in attachments:
        main_type, _, sub_type = content_type.partition("/")
        message.add_attachment(
            content,
            maintype=main_type or "application",
            subtype=sub_type or "octet-stream",
            filename=filename,
        )

    return message


def ses_client(service: str = "ses"):
    return boto3.client(
        service,
        region_name=env("AWS_REGION") or None,
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


def send_ses(request: SendEmailRequest, sender: str, attachments: list[tuple[str, str, bytes]]) -> str:
    arguments: dict[str, Any] = {
        "RawMessage": {"Data": build_message(request, sender, attachments).as_bytes()}
    }
    configuration_set = env("SES_CONFIGURATION_SET")
    if configuration_set:
        arguments["ConfigurationSetName"] = configuration_set
    response = ses_client().send_raw_email(**arguments)
    message_id = str(response.get("MessageId") or "")
    if not message_id:
        raise RuntimeError("AWS SES did not return a message identifier.")
    return message_id


def require_token(token: str | None) -> None:
    expected = env("EMAIL_API_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="EMAIL_API_TOKEN is not configured.")
    if token is None or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid email API token.")


def validate_certificate_url(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Invalid SNS signing certificate URL.")
    hostname = parsed.hostname or ""
    allowed_suffix = ".amazonaws.com"
    if not (hostname.startswith("sns.") and hostname.endswith(allowed_suffix)):
        raise HTTPException(status_code=400, detail="Invalid SNS signing certificate host.")
    if not parsed.path.endswith(".pem") or ".." in parsed.path:
        raise HTTPException(status_code=400, detail="Invalid SNS signing certificate path.")


def validate_callback_url(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise RuntimeError("EMAIL_EVENT_CALLBACK_URL must be a valid HTTPS URL.")


async def verify_sns_message(payload: dict[str, Any]) -> dict[str, Any]:
    required = ["Type", "MessageId", "TopicArn", "Message", "Timestamp", "Signature", "SignatureVersion", "SigningCertURL"]
    if any(not payload.get(key) for key in required):
        raise HTTPException(status_code=400, detail="Malformed SNS notification.")
    if payload["SignatureVersion"] != "1":
        raise HTTPException(status_code=400, detail="Unsupported SNS signature version.")

    certificate_url = str(payload["SigningCertURL"])
    validate_certificate_url(certificate_url)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            certificate_response = await client.get(certificate_url)
        certificate_response.raise_for_status()
        certificate = serialization.load_pem_x509_certificate(certificate_response.content)
    except Exception as error:
        raise HTTPException(status_code=400, detail="Could not load SNS signing certificate.") from error

    fields = ["Message", "MessageId"]
    if payload.get("Subject"):
        fields.append("Subject")
    if payload["Type"] == "SubscriptionConfirmation":
        fields.extend(["SubscribeURL", "Token"])
    fields.extend(["Timestamp", "TopicArn", "Type"])
    signed_content = "".join(f"{key}\n{payload[key]}\n" for key in fields).encode("utf-8")
    signature = base64.b64decode(str(payload["Signature"]))

    try:
        certificate.public_key().verify(
            signature,
            signed_content,
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid SNS signature.") from error

    return payload


async def forward_email_event(event: dict[str, Any]) -> None:
    callback_url = env("EMAIL_EVENT_CALLBACK_URL")
    callback_token = env("EMAIL_EVENT_WEBHOOK_TOKEN")
    if not callback_url or not callback_token:
        raise RuntimeError("Email event callback is not configured.")
    validate_callback_url(callback_url)

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            callback_url,
            json=event,
            headers={"X-Email-Event-Token": callback_token},
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Email event callback returned {response.status_code}.")


@app.get("/health")
async def health() -> dict[str, Any]:
    providers = configured_providers()
    configured = all(providers.values()) and bool(env("EMAIL_API_TOKEN"))
    return {"ok": configured, "providers": providers, "configured": configured}


@app.post("/v1/send-invoice")
async def send_invoice_email(
    request: SendEmailRequest,
    x_email_api_token: str | None = Header(default=None, alias="X-Email-Api-Token"),
) -> dict[str, str]:
    require_token(x_email_api_token)
    if not configured_providers()["ses"]:
        raise HTTPException(status_code=503, detail="AWS SES is not configured on the email API.")

    sender = env("EMAIL_FROM")
    attachments = decode_attachments(request.attachments)
    require_invoice_pdf(attachments)

    try:
        message_id = await run_in_threadpool(send_ses, request, sender, attachments)
        return {"provider": "SES", "providerMessageId": message_id}
    except (BotoCoreError, ClientError, Exception) as error:
        raise HTTPException(status_code=502, detail=f"Email delivery failed. SES: {sanitize_error(error)}") from error


@app.post("/webhooks/ses")
async def ses_webhook(request: Request) -> dict[str, str]:
    try:
        payload = await request.json()
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid SNS payload.")

    verified = await verify_sns_message(payload)
    if verified["Type"] == "SubscriptionConfirmation":
        try:
            await run_in_threadpool(
                lambda: ses_client("sns").confirm_subscription(
                    TopicArn=verified["TopicArn"],
                    Token=verified["Token"],
                )
            )
        except (BotoCoreError, ClientError) as error:
            raise HTTPException(status_code=502, detail=f"Subscription confirmation failed: {sanitize_error(error)}") from error
        return {"status": "confirmed"}

    if verified["Type"] != "Notification":
        return {"status": "ignored"}

    try:
        message = json.loads(str(verified["Message"]))
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid SNS message body.") from error

    event_type = str(message.get("eventType") or "")
    if event_type not in {"Delivery", "Bounce", "Complaint"}:
        return {"status": "ignored"}

    mail = message.get("mail") if isinstance(message.get("mail"), dict) else {}
    message_id = str(mail.get("messageId") or "")
    if not message_id:
        return {"status": "ignored"}

    recipients: list[str] = []
    if event_type == "Delivery":
        recipients = [str(item) for item in message.get("delivery", {}).get("recipients", [])]
    else:
        for recipient in message.get("bounce", {}).get("bouncedRecipients", []) + message.get("complaint", {}).get("complainedRecipients", []):
            if isinstance(recipient, dict) and recipient.get("emailAddress"):
                recipients.append(str(recipient["emailAddress"]))

    event = {
        "provider": "SES",
        "eventId": str(verified.get("MessageId") or ""),
        "eventType": event_type,
        "messageId": message_id,
        "recipients": recipients,
        "timestamp": str(message.get("mail", {}).get("timestamp") or verified.get("Timestamp") or ""),
        "reason": str(message.get("bounce", {}).get("bounceType") or message.get("complaint", {}).get("complaintType") or ""),
        "sns": {
            key: str(verified.get(key) or "")
            for key in ["Type", "MessageId", "TopicArn", "Message", "Timestamp", "Signature", "SignatureVersion", "SigningCertURL"]
        },
    }

    try:
        await forward_email_event(event)
    except (httpx.HTTPError, RuntimeError) as error:
        raise HTTPException(status_code=502, detail=f"Email event forwarding failed: {sanitize_error(error)}") from error

    return {"status": "accepted"}
