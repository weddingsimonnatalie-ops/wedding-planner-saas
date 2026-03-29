"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useWedding } from "@/context/WeddingContext";

interface Props {
  /** Whether the upgrade prompt is active. When false, children render unwrapped. */
  active: boolean;
  /** User-facing reason why the feature is blocked (from getEmailBlockReason). */
  reason: string;
  children: React.ReactNode;
  /**
   * Extra classes for the wrapper div (e.g. "flex-1" when the wrapped button
   * participates in a flex layout and needs to expand).
   */
  className?: string;
}

/**
 * Wraps a disabled feature button with a hover tooltip explaining the block
 * reason. For ADMIN users the tooltip includes an "Upgrade now →" link to the
 * billing page. For other roles only the reason text is shown.
 *
 * When active=false the component is a no-op and renders children directly.
 */
export function UpgradePrompt({ active, reason, children, className }: Props) {
  const { role } = useWedding();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!active) return <>{children}</>;

  function show() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  }

  function hide() {
    // Small delay so moving from button into tooltip doesn't cause flicker
    hideTimer.current = setTimeout(() => setVisible(false), 120);
  }

  const isAdmin = role === "ADMIN";

  return (
    <div
      className={`relative inline-flex${className ? ` ${className}` : ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}

      {visible && (
        <div
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-50 w-52 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl pointer-events-auto whitespace-normal"
        >
          <p className={isAdmin ? "mb-1.5" : undefined}>{reason}</p>
          {isAdmin && (
            <Link
              href="/billing"
              className="font-medium text-sky-300 hover:text-sky-200 underline underline-offset-2"
            >
              Upgrade now →
            </Link>
          )}
          {/* Caret arrow pointing down toward the button */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
