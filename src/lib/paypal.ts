/**
 * PayPal Subscriptions API client
 *
 * Uses lazy initialization for the OAuth2 token (env vars not available at build time on Railway).
 * Tokens are cached in-memory with expiry tracking to minimize API calls.
 */

// Token cache state
let tokenCache: { accessToken: string; expiresAt: number } | null = null;
let tokenFetchPromise: Promise<string> | null = null;

// Get PayPal API base URL based on mode
function getPayPalBaseUrl(): string {
  const mode = process.env.PAYPAL_MODE;
  if (mode === "live") {
    return "https://api-m.paypal.com";
  }
  // Default to sandbox
  return "https://api-m.sandbox.paypal.com";
}

// Get OAuth2 access token (with caching)
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  // If a token fetch is already in progress, wait for it
  if (tokenFetchPromise) {
    return tokenFetchPromise;
  }

  // Start a new token fetch
  tokenFetchPromise = (async () => {
    try {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
      }

      const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to get PayPal access token: ${response.status} ${text}`);
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      const accessToken = data.access_token;
      const expiresAt = Date.now() + data.expires_in * 1000;

      tokenCache = { accessToken, expiresAt };

      return accessToken;
    } finally {
      // Always clear the in-flight promise so the next call retries rather than
      // re-awaiting a cached rejection after a transient fetch failure.
      tokenFetchPromise = null;
    }
  })();

  return tokenFetchPromise;
}

// Make authenticated request to PayPal API
async function paypalRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${getPayPalBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal API error ${response.status}: ${text}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// PayPal subscription status type
export type PayPalSubscriptionStatus =
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

// PayPal subscription response shape
export interface PayPalSubscription {
  id: string;
  status: PayPalSubscriptionStatus;
  plan_id: string;
  start_time: string;
  billing_info?: {
    next_billing_time?: string;
    cycle_executions?: Array<{
      tenure_type: "TRIAL" | "REGULAR";
      sequence: number;
      cycles_completed: number;
      total_cycles: number;
    }>;
  };
  subscriber?: {
    email_address?: string;
    name?: { given_name?: string; surname?: string };
  };
  custom_id?: string;
}

// PayPal HATEOAS link
interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

// PayPal webhook event
export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
}

// Create a subscription
export async function createSubscription(
  planId: string,
  subscriberEmail: string,
  returnUrl: string,
  cancelUrl: string,
  weddingId: string
): Promise<{ subscriptionId: string; approvalUrl: string }> {
  const response = await paypalRequest<PayPalSubscription & { links: PayPalLink[] }>(
    "POST",
    "/v1/billing/subscriptions",
    {
      plan_id: planId,
      subscriber: { email_address: subscriberEmail },
      custom_id: weddingId,
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    }
  );

  const approvalLink = response.links.find((l) => l.rel === "approve");
  if (!approvalLink) {
    throw new Error("No approval link in PayPal subscription response");
  }

  return {
    subscriptionId: response.id,
    approvalUrl: approvalLink.href,
  };
}

// Get subscription details
export async function getSubscription(subscriptionId: string): Promise<PayPalSubscription> {
  return paypalRequest<PayPalSubscription>("GET", `/v1/billing/subscriptions/${subscriptionId}`);
}

// Cancel a subscription
export async function cancelSubscription(
  subscriptionId: string,
  reason: string
): Promise<void> {
  await paypalRequest<void>("POST", `/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    reason,
  });
}

// Suspend a subscription
export async function suspendSubscription(
  subscriptionId: string,
  reason: string
): Promise<void> {
  await paypalRequest<void>("POST", `/v1/billing/subscriptions/${subscriptionId}/suspend`, {
    reason,
  });
}

// Reactivate a suspended subscription
export async function activateSubscription(
  subscriptionId: string,
  reason: string
): Promise<void> {
  await paypalRequest<void>("POST", `/v1/billing/subscriptions/${subscriptionId}/activate`, {
    reason,
  });
}

// Verify webhook signature
export async function verifyWebhookSignature(
  headers: {
    "paypal-transmission-id": string;
    "paypal-transmission-time": string;
    "paypal-cert-url": string;
    "paypal-auth-algo": string;
    "paypal-transmission-sig": string;
  },
  rawBody: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PAYPAL_WEBHOOK_ID is not set");
  }

  // Validate cert_url domain before forwarding to PayPal's verification API.
  // Defence-in-depth: rejects forged requests that somehow bypass signature
  // verification if a future PayPal API anomaly were exploited.
  const allowedCertHosts = [
    "api.paypal.com",
    "api-m.paypal.com",
    "api.sandbox.paypal.com",
    "api-m.sandbox.paypal.com",
  ];
  let certHost: string;
  try {
    certHost = new URL(headers["paypal-cert-url"]).hostname;
  } catch {
    console.error("[PayPal] cert_url is not a valid URL:", headers["paypal-cert-url"]);
    return false;
  }
  if (!allowedCertHosts.includes(certHost)) {
    console.error("[PayPal] cert_url host not in allowlist:", certHost);
    return false;
  }

  try {
    const response = await paypalRequest<{ verification_status: string }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      {
        transmission_id: headers["paypal-transmission-id"],
        transmission_time: headers["paypal-transmission-time"],
        cert_url: headers["paypal-cert-url"],
        auth_algo: headers["paypal-auth-algo"],
        transmission_sig: headers["paypal-transmission-sig"],
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }
    );

    return response.verification_status === "SUCCESS";
  } catch (error) {
    console.error("[PayPal] Webhook signature verification failed:", error);
    return false;
  }
}

// Map PayPal subscription status to our SubStatus enum
import { SubStatus } from "@prisma/client";

export function paypalStatusToSubStatus(status: PayPalSubscriptionStatus): SubStatus | null {
  switch (status) {
    case "ACTIVE":
      return "ACTIVE";
    case "SUSPENDED":
      return "PAST_DUE";
    case "CANCELLED":
    case "EXPIRED":
      return "CANCELLED";
    case "APPROVAL_PENDING":
    case "APPROVED":
      // Checkout in progress - don't overwrite existing status
      return null;
    default:
      return null;
  }
}