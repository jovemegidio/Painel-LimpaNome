"use client";

import Link from "next/link";
import { QrCode, ArrowUpDown, FileText, Plus } from "lucide-react";

const actions = [
  {
    href: "/dashboard/pix",
    icon: QrCode,
    label: "PIX",
    sublabel: "Instantâneo",
    color: "text-indigo-500",
    bg: "rgba(99,102,241,0.08)",
    borderColor: "rgba(99,102,241,0.12)",
  },
  {
    href: "/dashboard/transferir",
    icon: ArrowUpDown,
    label: "Transferir",
    sublabel: "TED / DOC",
    color: "text-blue-500",
    bg: "rgba(59,130,246,0.08)",
    borderColor: "rgba(59,130,246,0.1)",
  },
  {
    href: "/dashboard/boleto",
    icon: FileText,
    label: "Boleto",
    sublabel: "Gerar cobrança",
    color: "text-purple-500",
    bg: "rgba(168,85,247,0.08)",
    borderColor: "rgba(168,85,247,0.1)",
  },
  {
    href: "/dashboard/pix#cobrar",
    icon: Plus,
    label: "Cobrar",
    sublabel: "QR Code",
    color: "text-amber-500",
    bg: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.1)",
  },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map((action) => (
        <Link
          key={action.label}
          href={action.href}
          className="group flex flex-col items-center gap-2.5 rounded-2xl p-4 sm:p-4 transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
          style={{
            background: "#ffffff",
            border: `1px solid ${action.borderColor}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.color} transition-transform duration-150 group-hover:scale-110`}
            style={{ background: action.bg }}
          >
            <action.icon className="h-5 w-5" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
              {action.label}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{action.sublabel}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

