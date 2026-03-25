"use client";

import { useState } from "react";
import { Mail, Check } from "lucide-react";

export function ReminderButton({ paymentId }: { paymentId: string }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    const res = await fetch("/api/email/payment-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    setSending(false);
    if (res.ok) setSent(true);
  }

  if (sent) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Check className="w-3 h-3" /> Sent
      </span>
    );
  }

  return (
    <button
      onClick={handleSend}
      disabled={sending}
      title="Send reminder email to yourself"
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors disabled:opacity-50"
    >
      <Mail className="w-3.5 h-3.5" />
      {sending ? "…" : "Remind"}
    </button>
  );
}
