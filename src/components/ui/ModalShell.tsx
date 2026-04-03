"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalShellProps {
  title: string;
  onClose: () => void;
  formId: string;
  submitLabel: React.ReactNode;
  submitDisabled?: boolean;
  children: React.ReactNode;
}

/**
 * Shared modal shell used by all add/edit modals.
 *
 * Mobile:  bottom sheet — slides up from the bottom, rounded top corners,
 *          drag handle indicator, footer is part of the flex layout (no
 *          position:fixed required).
 * Desktop: centred modal, same as before.
 *
 * The submit button is linked to the form via the HTML `form` attribute so
 * it works correctly even though it lives outside the <form> element.
 */
export function ModalShell({
  title,
  onClose,
  formId,
  submitLabel,
  submitDisabled,
  children,
}: ModalShellProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Bottom sheet (mobile) / centred modal (desktop) */}
      <div
        className="relative w-full md:max-w-lg md:mx-4 bg-white rounded-t-2xl md:rounded-xl shadow-xl flex flex-col h-[calc(100svh-env(safe-area-inset-top,0px))] md:h-auto md:max-h-[calc(100vh-4rem)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {/* Footer — always visible, part of the flex layout */}
        <div
          className="shrink-0 border-t border-gray-200 flex justify-end gap-3 px-5 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={submitDisabled}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
