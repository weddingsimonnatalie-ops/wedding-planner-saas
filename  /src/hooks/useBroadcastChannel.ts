"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Cross-tab communication using BroadcastChannel API.
 * Falls back to localStorage events for older browsers.
 *
 * Usage:
 * ```ts
 * const { postMessage, onMessage } = useBroadcastChannel<{ type: string }>('my-channel');
 *
 * // Send to other tabs
 * postMessage({ type: 'activity' });
 *
 * // Receive from other tabs
 * onMessage((message) => {
 *   console.log('Received:', message);
 * });
 * ```
 */

type MessageHandler<T> = (message: T) => void;

export function useBroadcastChannel<T = unknown>(channelName: string) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const handlersRef = useRef<Set<MessageHandler<T>>>(new Set());

  // Initialize channel on mount
  useEffect(() => {
    // Check if running in browser
    if (typeof window === "undefined") return;

    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel !== "undefined") {
      channelRef.current = new BroadcastChannel(channelName);

      channelRef.current.onmessage = (event: MessageEvent<T>) => {
        handlersRef.current.forEach((handler) => {
          try {
            handler(event.data);
          } catch (error) {
            console.error("BroadcastChannel handler error:", error);
          }
        });
      };

      return () => {
        channelRef.current?.close();
        channelRef.current = null;
      };
    }

    // Fallback: use localStorage for cross-tab communication
    const storageHandler = (event: StorageEvent) => {
      if (event.key !== channelName || !event.newValue) return;

      try {
        const message = JSON.parse(event.newValue) as T;
        handlersRef.current.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            console.error("LocalStorage handler error:", error);
          }
        });
      } catch (error) {
        console.error("Failed to parse localStorage message:", error);
      }
    };

    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("storage", storageHandler);
    };
  }, [channelName]);

  // Post a message to other tabs
  const postMessage = useCallback(
    (message: T) => {
      if (typeof window === "undefined") return;

      if (channelRef.current) {
        // Use BroadcastChannel
        channelRef.current.postMessage(message);
      } else {
        // Fallback: use localStorage
        try {
          localStorage.setItem(channelName, JSON.stringify(message));
          // Remove immediately to allow future messages with same content
          localStorage.removeItem(channelName);
        } catch (error) {
          console.error("Failed to post localStorage message:", error);
        }
      }
    },
    [channelName]
  );

  // Register a message handler
  const onMessage = useCallback((handler: MessageHandler<T>) => {
    handlersRef.current.add(handler);

    // Return unsubscribe function
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { postMessage, onMessage };
}

/**
 * Message types for inactivity sync across tabs
 */
export type InactivityMessage =
  | { type: "activity"; timestamp: number; tabId: string }
  | { type: "logout-warning"; timestamp: number; tabId: string }
  | { type: "extend-session"; timestamp: number; tabId: string }
  | { type: "logout"; timestamp: number; tabId: string };