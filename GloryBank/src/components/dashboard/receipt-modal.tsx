"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Download, Share2, CheckCircle } from "lucide-react";

interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  description: string | null;
  date: string;
  recipientName: string | null;
}

interface ReceiptModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  PIX_SENT: "PIX Enviado",
  PIX_RECEIVED: "PIX Recebido",
  BOLETO_CREATED: "Boleto Gerado",
  BOLETO_PAID: "Boleto Pago",
  TRANSFER_SENT: "Transferência Enviada",
  TRANSFER_RECEIVED: "Transferência Recebida",
  DEPOSIT: "Depósito",
  WITHDRAWAL: "Saque",
};

export function ReceiptModal({ transaction, isOpen, onClose }: ReceiptModalProps) {
  if (!transaction) return null;

  const isPositive =
    transaction.type.includes("RECEIVED") ||
    transaction.type === "DEPOSIT" ||
    transaction.type === "BOLETO_PAID";

  const handlePrint = () => {
    const receiptContent = document.getElementById("receipt-content");
    if (!receiptContent) return;

    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprovante - CredBusiness</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; }
          .header { text-align: center; padding-bottom: 16px; border-bottom: 2px solid #6366f1; margin-bottom: 20px; }
          .header h1 { color: #6366f1; font-size: 20px; margin-bottom: 4px; }
          .header p { color: #64748b; font-size: 11px; }
          .icon { text-align: center; margin: 16px 0; }
          .icon svg { width: 40px; height: 40px; color: #22c55e; }
          .section { margin-bottom: 16px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
          .row:last-child { border-bottom: none; }
          .label { color: #64748b; font-size: 12px; }
          .value { font-weight: 600; font-size: 13px; text-align: right; max-width: 60%; }
          .amount { font-size: 22px; font-weight: 700; text-align: center; padding: 16px 0; color: ${isPositive ? "#22c55e" : "#ef4444"}; }
          .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; color: #94a3b8; font-size: 10px; }
          .auth-code { font-family: monospace; letter-spacing: 1px; margin-top: 4px; font-size: 11px; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CredBusiness</h1>
          <p>Comprovante de Transação</p>
        </div>
        <div class="amount">${isPositive ? "+" : "−"} ${formatCurrency(Math.abs(transaction.amount))}</div>
        <div class="section">
          <div class="row"><span class="label">Tipo</span><span class="value">${typeLabels[transaction.type] || transaction.type}</span></div>
          <div class="row"><span class="label">Status</span><span class="value">${transaction.status === "CONFIRMED" ? "Confirmado" : transaction.status === "PENDING" ? "Pendente" : transaction.status}</span></div>
          <div class="row"><span class="label">Data/Hora</span><span class="value">${formatDate(transaction.date)}</span></div>
          ${transaction.recipientName ? `<div class="row"><span class="label">Destinatário</span><span class="value">${transaction.recipientName}</span></div>` : ""}
          ${transaction.description ? `<div class="row"><span class="label">Descrição</span><span class="value">${transaction.description}</span></div>` : ""}
          <div class="row"><span class="label">ID Transação</span><span class="value auth-code">${transaction.id}</span></div>
        </div>
        <div class="footer">
          <p>Documento emitido eletronicamente por CredBusiness</p>
          <p class="auth-code">Código de autenticação: ${transaction.id.toUpperCase().slice(-12)}</p>
          <p style="margin-top: 8px;">Este comprovante tem validade legal conforme Resolução BCB nº 1/2020</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleShare = async () => {
    const text = `Comprovante CredBusiness\n${typeLabels[transaction.type]}\nValor: ${isPositive ? "+" : "-"}${formatCurrency(Math.abs(transaction.amount))}\nData: ${formatDate(transaction.date)}${transaction.recipientName ? `\nDestinatário: ${transaction.recipientName}` : ""}\nID: ${transaction.id}`;

    if (navigator.share) {
      await navigator.share({ title: "Comprovante CredBusiness", text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("Comprovante copiado para a área de transferência!");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comprovante">
      <div id="receipt-content" className="space-y-4">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "rgba(34,197,94,0.1)" }}
          >
            <CheckCircle className="h-7 w-7 text-green-500" />
          </div>
        </div>

        {/* Amount */}
        <div className="text-center">
          <p
            className={`text-2xl font-bold ${
              isPositive ? "text-green-500" : "text-red-500"
            }`}
          >
            {isPositive ? "+" : "−"} {formatCurrency(Math.abs(transaction.amount))}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {typeLabels[transaction.type] || transaction.type}
          </p>
        </div>

        {/* Details */}
        <div
          className="space-y-2.5 rounded-xl p-4"
          style={{ background: "rgba(0,0,0,0.03)" }}
        >
          <Row label="Status">
            <span
              className={`text-sm font-medium ${
                transaction.status === "CONFIRMED"
                  ? "text-green-600"
                  : transaction.status === "PENDING"
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {transaction.status === "CONFIRMED"
                ? "Confirmado"
                : transaction.status === "PENDING"
                ? "Pendente"
                : transaction.status}
            </span>
          </Row>

          <Row label="Data/Hora">
            <span className="text-sm font-medium text-slate-700">
              {formatDate(transaction.date)}
            </span>
          </Row>

          {transaction.recipientName && (
            <Row label="Destinatário">
              <span className="text-sm font-medium text-slate-700">
                {transaction.recipientName}
              </span>
            </Row>
          )}

          {transaction.description && (
            <Row label="Descrição">
              <span className="text-sm font-medium text-slate-700">
                {transaction.description}
              </span>
            </Row>
          )}

          <Row label="ID Transação">
            <span className="text-xs font-mono text-slate-500">
              {transaction.id}
            </span>
          </Row>

          <Row label="Código Auth.">
            <span className="text-xs font-mono text-slate-500">
              {transaction.id.toUpperCase().slice(-12)}
            </span>
          </Row>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={handlePrint} className="flex-1">
            <Download className="mr-2 h-4 w-4" />
            Baixar PDF
          </Button>
          <Button variant="outline" onClick={handleShare} className="flex-1">
            <Share2 className="mr-2 h-4 w-4" />
            Compartilhar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      {children}
    </div>
  );
}
