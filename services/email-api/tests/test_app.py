import base64

import pytest
from fastapi.testclient import TestClient

import app as email_api


def pdf_attachment(filename="invoice.pdf"):
    return {
        "filename": filename,
        "contentType": "application/pdf",
        "contentBase64": base64.b64encode(b"%PDF-1.4\ntest invoice\n%%EOF").decode("ascii"),
    }


def send_payload():
    return {
        "to": ["recipient@example.com"],
        "cc": [],
        "bcc": [],
        "subject": "Invoice",
        "text": "Invoice attached",
        "html": "<p>Invoice attached</p>",
        "attachments": [pdf_attachment()],
        "idempotencyKey": "e2e-test-key",
        "invoiceId": "00000000-0000-4000-8000-000000000001",
    }


def test_decode_attachments_rejects_invalid_base64():
    with pytest.raises(Exception) as error:
        email_api.decode_attachments([
            email_api.Attachment(
                filename="bad.pdf",
                contentType="application/pdf",
                contentBase64="!!!",
            )
        ])
    assert "Invalid attachment encoding" in str(error.value.detail)


def test_require_invoice_pdf_rejects_non_pdf_payload():
    with pytest.raises(Exception) as error:
        email_api.require_invoice_pdf([("invoice.pdf", "application/pdf", b"not a pdf")])
    assert "valid PDF invoice attachment" in str(error.value.detail)


def test_build_message_adds_attachment_and_deterministic_message_id():
    request = email_api.SendEmailRequest(**send_payload())
    attachments = email_api.decode_attachments(request.attachments)
    message = email_api.build_message(request, "invoice@example.test", attachments)
    payload = message.as_bytes()
    expected_id = email_api.hashlib.sha256(request.idempotencyKey.encode()).hexdigest()
    assert f"<{expected_id}@zenbook.invoice>".encode() in payload
    assert b"invoice.pdf" in payload


def test_require_token_rejects_invalid_token(monkeypatch):
    monkeypatch.setenv("EMAIL_API_TOKEN", "expected-token")
    with pytest.raises(Exception) as error:
        email_api.require_token("wrong-token")
    assert error.value.status_code == 401


@pytest.mark.parametrize(
    "url",
    [
        "http://sns.ap-south-1.amazonaws.com/cert.pem",
        "https://example.com/cert.pem",
        "https://sns.ap-south-1.amazonaws.com/../cert.pem",
        "https://sns.ap-south-1.amazonaws.com/cert.txt",
    ],
)
def test_validate_certificate_url_rejects_unsafe_values(url):
    with pytest.raises(Exception) as error:
        email_api.validate_certificate_url(url)
    assert error.value.status_code == 400


def test_health_reports_configured_state(monkeypatch):
    monkeypatch.setenv("EMAIL_API_TOKEN", "test-token")
    monkeypatch.setenv("EMAIL_FROM", "invoice@example.test")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    response = TestClient(email_api.app).get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "providers": {"ses": True},
        "configured": True,
    }


def test_send_invoice_accepts_valid_pdf_and_returns_provider_message_id(monkeypatch):
    monkeypatch.setenv("EMAIL_API_TOKEN", "test-token")
    monkeypatch.setenv("EMAIL_FROM", "invoice@example.test")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setattr(email_api, "send_ses", lambda *args: "ses-message-id")

    response = TestClient(email_api.app).post(
        "/v1/send-invoice",
        json=send_payload(),
        headers={"X-Email-Api-Token": "test-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"provider": "SES", "providerMessageId": "ses-message-id"}
