"use client";

import { signOut } from "@/lib/auth-client";
import { LogOut, User } from "lucide-react";

interface HeaderProps {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <span>{user?.name ?? user?.email ?? "User"}</span>
        </div>
        <button
          onClick={async () => { await signOut(); window.location.href = "/login"; }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </header>
  );
}
