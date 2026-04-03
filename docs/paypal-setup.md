# PayPal Integration Setup Guide

This guide walks you through setting up PayPal Subscriptions for the wedding planner app.

## Prerequisites

- A PayPal Business account (personal accounts don't support Subscriptions API)
- Access to [PayPal Developer Dashboard](https://developer.paypal.com/)

---

## Step 1: Create a PayPal Developer Account

1. Go to [developer.paypal.com](https://developer.paypal.com/)
2. Log in with your PayPal Business account
3. If prompted, complete the developer program signup

---

## Step 2: Create a REST API Application

1. In the Developer Dashboard, go to **My Apps & Credentials**
2. Make sure you're on the **Sandbox** tab (for testing) or **Live** tab (for production)
3. Click **Create App**
4. Enter an app name, e.g., `OurVowStory Subscription`
5. Select your business account as the app owner
6. Click **Create App**

### Get Your Credentials

After creating the app, you'll see:

- **Client ID** → This is your `PAYPAL_CLIENT_ID`
- **Client Secret** → Click "Show" → This is your `PAYPAL_CLIENT_SECRET`

Copy these to your `.env` file:

```env
PAYPAL_CLIENT_ID=your_client_id_here
PAYPAL_CLIENT_SECRET=your_client_secret_here
```

---

## Step 3: Set Up API Permissions

Your app needs permission to use the Subscriptions API:

1. In your app settings, find **API Credentials**
2. Scroll to **REST API apps**
3. Ensure **Accept payments** and **Bill recurring payments** are enabled
4. For sandbox, these are usually auto-enabled

---

## Step 4: Create a Product

PayPal requires you to create a "Product" before creating a Billing Plan.

### Using the API (recommended):

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/catalogs/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "Wedding Planner Subscription",
    "description": "Monthly subscription for wedding planning tools",
    "type": "SERVICE",
    "category": "SOFTWARE"
  }'
```

To get an access token:
```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/oauth2/token" \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

The response will include a `product_id`. Save this for the next step.

---

## Step 5: Create a Billing Plan

Create a plan with a **14-day free trial** followed by **monthly billing**:

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/plans" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "name": "Wedding Planner Standard",
    "description": "Standard monthly plan with 14-day trial",
    "product_id": "YOUR_PRODUCT_ID",
    "billing_cycles": [
      {
        "frequency": {
          "interval_unit": "DAY",
          "interval_count": 14
        },
        "tenure_type": "TRIAL",
        "sequence": 1,
        "total_cycles": 1,
        "pricing_scheme": {
          "fixed_price": {
            "value": "0",
            "currency_code": "GBP"
          }
        }
      },
      {
        "frequency": {
          "interval_unit": "MONTH",
          "interval_count": 1
        },
        "tenure_type": "REGULAR",
        "sequence": 2,
        "total_cycles": 0,
        "pricing_scheme": {
          "fixed_price": {
            "value": "12",
            "currency_code": "GBP"
          }
        }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "payment_failure_threshold": 3
    }
  }'
```

The response will include a `plan_id`. This is your `PAYPAL_PLAN_ID_STANDARD`.

### Price and Currency

Change `value` and `currency_code` to match your pricing:
- `value`: The amount (e.g., `"12"` for £12)
- `currency_code`: Your currency (`GBP`, `USD`, `EUR`, etc.)

---

## Step 6: Create a Webhook

1. Go to **My Apps & Credentials** → Select your app
2. Scroll to **Webhooks** section
3. Click **Add Webhook**

### Sandbox Webhook:
- **Webhook URL**: Your tunnel URL + `/api/webhooks/paypal`
  - Local: Use ngrok/cloudflare tunnel, e.g., `https://your-tunnel.trycloudflare.com/api/webhooks/paypal`
  - Production: `https://yourdomain.com/api/webhooks/paypal`

### Events to Subscribe:

Select these event types:

- `BILLING.SUBSCRIPTION.CREATED`
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`

After creating, you'll see a **Webhook ID**. This is your `PAYPAL_WEBHOOK_ID`.

---

## Step 7: Environment Variables

Add all values to your `.env` file:

```env
# PayPal Configuration
PAYPAL_CLIENT_ID=AXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
PAYPAL_CLIENT_SECRET=EXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
PAYPAL_MODE=sandbox
PAYPAL_WEBHOOK_ID=1X3456789012345678
PAYPAL_PLAN_ID_STANDARD=P-5XN29873GH712705HMAB5OAI
```

### Production vs Sandbox

- **Sandbox** (testing): `PAYPAL_MODE=sandbox`
- **Live** (production): `PAYPAL_MODE=live`

You'll need separate credentials for each environment:
- Create a separate app in the **Live** tab
- Create a separate product and plan for live
- Create a separate webhook for live

---

## Step 8: Testing in Sandbox

### Test Accounts

PayPal provides sandbox test accounts:
1. Go to **My Apps & Credentials** → **Sandbox** → **Accounts**
2. You'll see a personal (buyer) account and a business account
3. Use the personal account email/password to simulate purchases

### Test Flow

1. Register on your app with PayPal selected
2. You'll be redirected to PayPal sandbox
3. Log in with the sandbox personal account
4. Approve the subscription
5. Verify webhook events in the Developer Dashboard

---

## Step 9: Going Live

### Checklist Before Production

1. ✅ Create a Live REST API app (not Sandbox)
2. ✅ Create a Live Product
3. ✅ Create a Live Billing Plan
4. ✅ Create a Live Webhook pointing to your production URL
5. ✅ Update `.env` with Live credentials
6. ✅ Set `PAYPAL_MODE=live`
7. ✅ Test the complete flow in Sandbox first
8. ✅ Verify webhook delivery in Developer Dashboard

### Update Environment Variables

```env
PAYPAL_CLIENT_ID=your_live_client_id
PAYPAL_CLIENT_SECRET=your_live_client_secret
PAYPAL_MODE=live
PAYPAL_WEBHOOK_ID=your_live_webhook_id
PAYPAL_PLAN_ID_STANDARD=your_live_plan_id
```

---

## Troubleshooting

### Webhook Not Received

1. Check your webhook URL is publicly accessible
2. Verify the URL in PayPal matches exactly (including `/api/webhooks/paypal`)
3. Check server logs for errors
4. In Developer Dashboard → Webhooks, you can see delivery attempts and resend

### Subscription Not Created

1. Check `PAYPAL_PLAN_ID_STANDARD` is set correctly
2. Verify the plan is in the correct status (ACTIVE)
3. Check PayPal API logs in Developer Dashboard

### Signature Verification Failed

1. Ensure `PAYPAL_WEBHOOK_ID` matches the webhook you created
2. Verify you're using the correct mode (sandbox vs live)
3. Check that all 5 webhook headers are being passed

### Trial Not Working

1. Verify the billing plan has `tenure_type: "TRIAL"` as the first cycle
2. Ensure `total_cycles: 1` for the trial cycle
3. Check `total_cycles: 0` for the regular cycle (infinite)

---

## API Reference

- [PayPal Subscriptions API](https://developer.paypal.com/docs/api/subscriptions/v1/)
- [PayPal Webhooks](https://developer.paypal.com/docs/api/webhooks/v1/)
- [PayPal Developer Dashboard](https://developer.paypal.com/developer/applications)

---

## Quick Command Reference

### Get Access Token

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/oauth2/token" \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

### Create Product

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/catalogs/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "name": "Wedding Planner Subscription",
    "description": "Monthly subscription for wedding planning tools",
    "type": "SERVICE",
    "category": "SOFTWARE"
  }'
```

### Create Plan (14-day trial + £12/month)

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/plans" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "name": "Wedding Planner Standard",
    "description": "Standard monthly plan with 14-day trial",
    "product_id": "PRODUCT_ID",
    "billing_cycles": [
      {
        "frequency": { "interval_unit": "DAY", "interval_count": 14 },
        "tenure_type": "TRIAL",
        "sequence": 1,
        "total_cycles": 1,
        "pricing_scheme": { "fixed_price": { "value": "0", "currency_code": "GBP" } }
      },
      {
        "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
        "tenure_type": "REGULAR",
        "sequence": 2,
        "total_cycles": 0,
        "pricing_scheme": { "fixed_price": { "value": "12", "currency_code": "GBP" } }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "payment_failure_threshold": 3
    }
  }'
```

### List Plans

```bash
curl -X GET "https://api-m.sandbox.paypal.com/v1/billing/plans" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Verify Webhook Signature (for debugging)

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "transmission_id": "WEBHOOK_TRANSMISSION_ID",
    "transmission_time": "2024-01-01T00:00:00Z",
    "cert_url": "CERT_URL_FROM_HEADER",
    "auth_algo": "sha256WithRSA",
    "transmission_sig": "SIGNATURE_FROM_HEADER",
    "webhook_id": "YOUR_WEBHOOK_ID",
    "webhook_event": { "id": "EVENT_ID", "event_type": "PAYMENT.SALE.COMPLETED" }
  }'
```