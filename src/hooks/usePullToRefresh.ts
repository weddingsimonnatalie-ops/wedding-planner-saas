"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}

interface UsePullToRefreshResult {
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const THRESHOLD = 64; // pixels to pull before triggering refresh

export function usePullToRefresh({
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef(0);
  const currentY = useRef(0);
  const isActive = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled) return;

    const container = containerRef.current;
    if (!container) return;

    // Only activate when scrolled to top
    if (container.scrollTop > 0) return;

    startY.current = e.touches[0].clientY;
    isActive.current = true;
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isActive.current || disabled) return;

    const container = containerRef.current;
    if (!container) return;

    // Check if still at top
    if (container.scrollTop > 0) {
      isActive.current = false;
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    currentY.current = e.touches[0].clientY;
    const distance = currentY.current - startY.current;

    // Only care about downward pulls
    if (distance > 0) {
      setIsPulling(true);
      // Apply resistance - distance grows slower as you pull more
      const resisted = Math.min(distance * 0.5, THRESHOLD * 2);
      setPullDistance(resisted);
    } else {
      setIsPulling(false);
      setPullDistance(0);
    }
  }, [disabled]);

  const handleTouchEnd = useCallback(async () => {
    if (!isActive.current || disabled) return;

    isActive.current = false;

    if (pullDistance >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setIsPulling(false);
      setPullDistance(0);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setIsPulling(false);
      setPullDistance(0);
    }
  }, [disabled, pullDistance, isRefreshing, onRefresh]);

  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isPulling,
    pullDistance,
    isRefreshing,
    containerRef,
  };
}