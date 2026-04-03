"use client";

import { Search } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { GuestSummary } from "@/lib/seating-types";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  unassigned: GuestSummary[];
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (guestId: string) => void;
  assigning?: boolean;
}

export function MobileSeatSheet({
  open,
  onClose,
  title,
  subtitle,
  unassigned,
  search,
  onSearchChange,
  onSelect,
  assigning,
}: Props) {
  const filtered = unassigned.filter((g) => {
    if (!search) return true;
    return `${g.firstName} ${g.lastName}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="px-4 pt-1 pb-3">
        <p className="text-sm text-gray-500 mb-3">{subtitle}</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            autoFocus
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search guests…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      <div className="px-2 pb-6">
        {assigning && (
          <p className="text-sm text-gray-400 text-center py-8">Assigning…</p>
        )}
        {!assigning && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            {unassigned.length === 0 ? "All guests are seated" : "No guests match"}
          </p>
        )}
        {!assigning &&
          filtered.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className="w-full flex flex-col items-start px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
            >
              <span className="text-sm font-medium text-gray-900">
                {g.firstName} {g.lastName}
              </span>
              {g.groupName && (
                <span className="text-xs text-gray-400">{g.groupName}</span>
              )}
            </button>
          ))}
      </div>
    </BottomSheet>
  );
}
