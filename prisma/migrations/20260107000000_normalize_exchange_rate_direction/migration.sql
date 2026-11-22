DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Invoice" WHERE "exchange_rate" <= 0) THEN
    RAISE EXCEPTION 'Invoice.exchange_rate must be positive before normalization';
  END IF;
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "exchangeRate" <= 0) THEN
    RAISE EXCEPTION 'Payment.exchangeRate must be positive before normalization';
  END IF;
END $$;

UPDATE "Invoice"
SET "exchange_rate" = 1
WHERE "currency_code" = "base_currency_code" AND "exchange_rate" <> 1;

UPDATE "Invoice"
SET "exchange_rate" = ROUND((1.0 / "exchange_rate")::numeric, 8)
WHERE "currency_code" <> "base_currency_code" AND "exchange_rate" <> 1;

UPDATE "Payment"
SET "exchangeRate" = 1,
    "amountInBaseCurrency" = ROUND(amount::numeric, 4)
WHERE "currencyCode" = "baseCurrencyCode" AND "exchangeRate" <> 1;

UPDATE "Payment"
SET "exchangeRate" = ROUND((1.0 / "exchangeRate")::numeric, 8),
    "amountInBaseCurrency" = ROUND((amount * (1.0 / "exchangeRate"))::numeric, 4)
WHERE "currencyCode" <> "baseCurrencyCode" AND "exchangeRate" <> 1;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_exchange_rate_positive" CHECK ("exchange_rate" > 0),
  ADD CONSTRAINT "Invoice_base_currency_rate_is_one" CHECK ("currency_code" <> "base_currency_code" OR "exchange_rate" = 1);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_exchange_rate_positive" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "Payment_base_currency_rate_is_one" CHECK ("currencyCode" <> "baseCurrencyCode" OR "exchangeRate" = 1);
