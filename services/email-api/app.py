import base64
import binascii
import os
import ssl
from email.message import EmailMessage
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from starlette.concurrency import run_in_threadpool

app = FastAPI(title="Zenbook Email API", version="1.0.0")


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


def parse_bool(value: str, fallback: bool) -> bool:
    if not value:
        return fallback
    return value.strip().lower() in {"1", "true", "yes", "on"}


def configured_providers() -> dict[str, bool]:
    return {
        "resend": bool(env("RESEND_API_KEY") and env("EMAIL_FROM")),
        "smtp": bool(
            env("SMTP_HOST")
            and env("SMTP_PORT")
            and env("SMTP_USER")
            and env("SMTP_PASSWORD")
            and env("EMAIL_FROM")
        ),
    }


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


def build_smtp_message(request: SendEmailRequest, sender: str, attachments: list[tuple[str, str, bytes]]) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(request.to)
    if request.cc:
        message["Cc"] = ", ".join(request.cc)
    message["Subject"] = request.subject
    message["Message-ID"] = f"<{request.idempotencyKey}@zenbook.invoice>"
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


def send_smtp(request: SendEmailRequest, sender: str, attachments: list[tuple[str, str, bytes]]) -> str:
    host = env("SMTP_HOST")
    port = int(env("SMTP_PORT"))
    user = env("SMTP_USER")
    password = env("SMTP_PASSWORD")
    secure = parse_bool(env("SMTP_SECURE"), port == 465)
    timeout = int(env("SMTP_TIMEOUT") or "20")
    recipients = [*request.to, *request.cc, *request.bcc]
    message = build_smtp_message(request, sender, attachments)

    if secure:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=timeout) as client:
            client.login(user, password)
            client.send_message(message, to_addrs=recipients)
    else:
        with smtplib.SMTP(host, port, timeout=timeout) as client:
            client.starttls(context=ssl.create_default_context())
            client.login(user, password)
            client.send_message(message, to_addrs=recipients)

    return f"smtp:{request.idempotencyKey}"


async def send_resend(request: SendEmailRequest, sender: str, attachments: list[tuple[str, str, bytes]]) -> str:
    payload: dict[str, Any] = {
        "from": sender,
        "to": request.to,
        "subject": request.subject,
        "text": request.text,
        "html": request.html,
    }
    if request.cc:
        payload["cc"] = request.cc
    if request.bcc:
        payload["bcc"] = request.bcc
    if attachments:
        payload["attachments"] = [
            {
                "filename": filename,
                "content": base64.b64encode(content).decode("ascii"),
            }
            for filename, _, content in attachments
        ]

    headers = {
        "Authorization": f"Bearer {env('RESEND_API_KEY')}",
        "Idempotency-Key": request.idempotencyKey,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
    if response.status_code >= 400:
        raise RuntimeError(f"Resend returned {response.status_code}: {sanitize_error(Exception(response.text[:200]))}")
    data = response.json()
    return str(data.get("id") or f"resend:{request.idempotencyKey}")


def require_token(token: str | None) -> None:
    expected = env("EMAIL_API_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="EMAIL_API_TOKEN is not configured.")
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid email API token.")


@app.get("/health")
async def health() -> dict[str, Any]:
    providers = configured_providers()
    return {"ok": True, "providers": providers, "configured": any(providers.values())}


@app.post("/v1/send-invoice")
async def send_invoice_email(
    request: SendEmailRequest,
    x_email_api_token: str | None = Header(default=None, alias="X-Email-Api-Token"),
) -> dict[str, str]:
    require_token(x_email_api_token)

    providers = configured_providers()
    if not any(providers.values()):
        raise HTTPException(status_code=503, detail="No email provider is configured on the email API.")

    sender = env("EMAIL_FROM")
    attachments = decode_attachments(request.attachments)
    failures: list[str] = []

    if providers["resend"]:
        try:
            message_id = await send_resend(request, sender, attachments)
            return {"provider": "RESEND", "providerMessageId": message_id}
        except Exception as error:
            failures.append(f"RESEND: {sanitize_error(error)}")

    if providers["smtp"]:
        try:
            message_id = await run_in_threadpool(send_smtp, request, sender, attachments)
            return {"provider": "SMTP", "providerMessageId": message_id}
        except Exception as error:
            failures.append(f"SMTP: {sanitize_error(error)}")

    raise HTTPException(status_code=502, detail="Email delivery failed. " + " | ".join(failures))
