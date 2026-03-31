"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  colour: string;
  onClick: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  actions: SwipeAction[];
  disabled?: boolean;
}

const MAX_REVEAL = 120; // pixels
const SNAP_THRESHOLD = 60; // pixels

export function SwipeableRow({ children, actions, disabled = false }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || window.innerWidth >= 768) return;
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
    isDragging.current = true;
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || disabled || window.innerWidth >= 768) return;

    currentX.current = e.touches[0].clientX;
    const diff = startX.current - currentX.current; // Positive when swiping left

    if (diff > 0) {
      // Swiping left - reveal actions
      setOffset(Math.min(diff, MAX_REVEAL));
    } else if (isOpen && diff < 0) {
      // Swiping right while open - close
      setOffset(Math.max(0, MAX_REVEAL + diff));
    }
  }, [disabled, isOpen]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || disabled) return;

    isDragging.current = false;

    const diff = startX.current - currentX.current;

    if (diff > SNAP_THRESHOLD) {
      // Snapped open
      setOffset(MAX_REVEAL);
      setIsOpen(true);
    } else if (diff < -SNAP_THRESHOLD && isOpen) {
      // Snapped closed
      setOffset(0);
      setIsOpen(false);
    } else if (isOpen) {
      // Was open, stay open
      setOffset(MAX_REVEAL);
    } else {
      // Was closed, stay closed
      setOffset(0);
    }
  }, [disabled, isOpen]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClick() {
      setOffset(0);
      setIsOpen(false);
    }

    // Delay to avoid immediate close from the same touch event
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [isOpen]);

  const handleActionClick = useCallback((action: SwipeAction) => {
    action.onClick();
    setOffset(0);
    setIsOpen(false);
  }, []);

  return (
    <div className="relative md:static">
      {/* Action buttons - revealed on swipe */}
      <div
        className="absolute right-0 top-0 bottom-0 flex md:hidden"
        style={{ width: `${MAX_REVEAL}px` }}
      >
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleActionClick(action)}
            className={`flex-1 flex flex-col items-center justify-center text-white ${action.colour}`}
            style={{ width: `${MAX_REVEAL / actions.length}px` }}
          >
            {action.icon}
            <span className="text-[10px] mt-1">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Content - slides left to reveal actions */}
      <div
        className="relative bg-white transition-transform md:transition-none"
        style={{
          transform: `translateX(-${offset}px)`,
          touchAction: "pan-y",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}