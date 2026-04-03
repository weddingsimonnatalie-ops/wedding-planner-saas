# PayPal Integration Security Fix Plan

Fixes ordered by severity. Each phase is independently deployable.

---

## Phase 1 — Fix token cache failure (Medium, ~10 min)

**File:** `src/lib/paypal.ts`

**Problem:** If the OAuth2 token fetch throws, `tokenFetchPromise` is never reset to `null`. All subsequent PayPal API calls await the same rejected promise and fail permanently until process restart.

**Fix:** Move `tokenFetchPromise = null` into a `finally` block so it clears on both success and failure.

```ts
// Before (line 35–65):
tokenFetchPromise = (async () => {
  const clientId = ...
  // ... fetch logic ...
  tokenCache = { accessToken, expiresAt };
  tokenFetchPromise = null;   // ← only runs on success
  return accessToken;
})();

// After:
tokenFetchPromise = (async () => {
  try {
    const clientId = ...
    // ... fetch logic ...
    tokenCache = { accessToken, expiresAt };
    return accessToken;
  } finally {
    tokenFetchPromise = null;  // ← always clears
  }
})();
```

**Test:** Temporarily break `PAYPAL_CLIENT_SECRET`, make two API calls in quick succession, confirm the second call retries the fetch rather than re-throwing the cached rejection.

---

## Phase 2 — Verify subscription ownership in capture (Medium, ~15 min)

**File:** `src/app/api/billing/paypal-capture/route.ts`

**Problem:** The endpoint verifies the subscription exists in PayPal but does not check that `subscription.custom_id` matches the authenticated wedding. An ADMIN knowing another wedding's subscription ID (e.g. copied from a redirect URL) could claim it.

**Fix:** After `getSubscription()`, validate `custom_id`:

```ts
// After the existing status check, before prisma.wedding.update:
if (subscription.custom_id !== auth.weddingId) {
  return NextResponse.json(
    { error: "Subscription does not belong to this account" },
    { status: 403 }
  );
}
```

**Test:** Create a subscription for wedding A, then call `/api/billing/paypal-capture` authenticated as wedding B with wedding A's subscription ID — should now return 403.

---

## Phase 3 — Tighten accepted capture statuses (Info, ~5 min)

**File:** `src/app/api/billing/paypal-capture/route.ts`

**Problem:** `APPROVAL_PENDING` is accepted as a valid post-checkout status, meaning a subscription can be associated before the user has approved it in PayPal. The webhook flow corrects it eventually but the interim state is misleading.

**Fix:** Remove `APPROVAL_PENDING` from the valid set:

```ts
// Before:
const validStatuses = ["APPROVAL_PENDING", "APPROVED", "ACTIVE"];

// After:
const validStatuses = ["APPROVED", "ACTIVE"];
```

**Note:** PayPal redirects back to `return_url` only after approval, so in practice this status should never arrive at capture. Removing it makes the intent explicit.

---

## Phase 4 — Harden webhook idempotency (Low, ~20 min)

**File:** `src/app/api/webhooks/paypal/route.ts`

**Problem:** The check-then-process-then-record pattern has a race window: two simultaneous deliveries of the same event ID both pass the idempotency check and both mutate the DB before either records the event.

**Fix:** Attempt to insert the idempotency record *before* processing using `upsert` with a skip-on-conflict. If the insert was a no-op (already existed), skip processing and return 200.

```ts
// Replace the existing findUnique check (lines 49–54) with:
const { count } = await prisma.$executeRaw`
  INSERT INTO "PayPalEvent" ("id", "eventId", "eventType", "processedAt")
  VALUES (${cuid()}, ${event.id}, ${event.event_type}, NOW())
  ON CONFLICT ("eventId") DO NOTHING
`;

if (count === 0) {
  // Already processed
  return NextResponse.json({ received: true });
}
```

Alternatively, use Prisma's `createMany` with `skipDuplicates`:
```ts
const result = await prisma.payPalEvent.createMany({
  data: [{ eventId: event.id, eventType: event.event_type }],
  skipDuplicates: true,
});
if (result.count === 0) {
  return NextResponse.json({ received: true });
}
```

Remove the `prisma.payPalEvent.create` at the bottom of the handler (line 230).

**Caveat:** If processing throws a 500, PayPal retries — but the event is now recorded and won't be re-processed. This trades "retry on failure" for "no duplicate processing". Given PayPal's retry behaviour, this is the safer trade-off. Add a log on early-exit so failures are visible.

---

## Phase 5 — Validate cert_url domain (Low, ~10 min)

**File:** `src/lib/paypal.ts`

**Problem:** The `paypal-cert-url` header value is forwarded to PayPal's verification API without local validation. If signature verification were ever bypassed by a PayPal API anomaly, a forged cert URL would be the attack vector.

**Fix:** Validate the cert URL domain before forwarding:

```ts
// Add at the top of verifyWebhookSignature, before the paypalRequest call:
const allowedHosts = [
  "api.paypal.com",
  "api-m.paypal.com",
  "api.sandbox.paypal.com",
  "api-m.sandbox.paypal.com",
];
let certHost: string;
try {
  certHost = new URL(headers["paypal-cert-url"]).hostname;
} catch {
  console.error("[PayPal] Invalid cert_url:", headers["paypal-cert-url"]);
  return false;
}
if (!allowedHosts.includes(certHost)) {
  console.error("[PayPal] cert_url host not in allowlist:", certHost);
  return false;
}
```

---

## Execution Order

| Phase | Effort | Risk | Deploy independently? |
|-------|--------|------|-----------------------|
| 1 — Token cache fix | ~10 min | Low | Yes |
| 2 — Capture ownership check | ~15 min | Low | Yes |
| 3 — Remove APPROVAL_PENDING | ~5 min | Very low | Yes (batch with 2) |
| 4 — Webhook idempotency | ~20 min | Medium (changes retry semantics) | Yes, test carefully |
| 5 — cert_url validation | ~10 min | Very low | Yes |

Recommended: ship Phases 1+2+3 together (all small, no semantic changes), then Phase 5, then Phase 4 after reviewing the idempotency trade-off.
