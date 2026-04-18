"use client";

import { Bell, Menu } from "lucide-react";
import { getInitials } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

interface HeaderProps {
  userName: string;
  userEmail: string;
  onMenuOpen?: () => void;
}

export function Header({ userName, userEmail, onMenuOpen }: HeaderProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setUnreadCount(res.data.unreadCount || 0);
      })
      .catch(() => {});
  }, []);

  return (
    <header
      className="sticky top-0 z-30 flex h-[64px] shrink-0 items-center gap-3 px-4 sm:px-6 lg:px-8"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuOpen}
        className="flex lg:hidden -ml-1 rounded-xl p-2 text-slate-500 transition-colors hover:bg-black/[0.04] hover:text-slate-700"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page context */}
      <div className="flex-1 min-w-0">
        <h2 className="text-[14px] font-semibold text-slate-800 truncate">
          Olá, {userName.split(" ")[0]}!
        </h2>
        <p className="hidden sm:block text-[11px] text-slate-500">
          Internet Banking — CredBusiness
        </p>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Notification bell */}
        <Link
          href="/dashboard/notificacoes"
          className="relative rounded-xl p-2.5 text-slate-500 transition-all duration-150 hover:bg-black/[0.04] hover:text-slate-700"
          aria-label="Notificações"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span
              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white"
              style={{ boxShadow: "0 0 6px rgba(99,102,241,0.7)" }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        {/* User avatar */}
          <div className="ml-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-150 hover:bg-black/[0.03] cursor-default">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              boxShadow: "0 2px 8px rgba(99,102,241,0.4)",
            }}
          >
            {getInitials(userName)}
          </div>
          <div className="hidden lg:block min-w-0">
            <p className="text-[13px] font-medium text-slate-700 truncate max-w-[140px]">
              {userName}
            </p>
            <p className="text-[11px] text-slate-400 truncate max-w-[140px]">
              {userEmail}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

