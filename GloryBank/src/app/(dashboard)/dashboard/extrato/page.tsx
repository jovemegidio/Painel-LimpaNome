"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Calendar, Filter, Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionList } from "@/components/dashboard/transaction-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoading } from "@/components/ui/loading";
import { Toaster } from "react-hot-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

interface TransactionData {
  id: string;
  type: string;
  status: string;
  amount: number;
  description: string | null;
  date: string;
  recipientName: string | null;
}

export default function ExtratoPage() {
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [finishDate, setFinishDate] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchTransactions = useCallback(
    async (reset = false) => {
      try {
        const currentOffset = reset ? 0 : offset;
        const params = new URLSearchParams({
          limit: "20",
          offset: String(currentOffset),
        });
        if (startDate) params.set("startDate", startDate);
        if (finishDate) params.set("finishDate", finishDate);

        const res = await fetch(`/api/asaas/transactions?${params}`);
        const result = await res.json();

        if (result.success) {
          if (reset) {
            setTransactions(result.data.data || []);
          } else {
            setTransactions((prev) => [
              ...prev,
              ...(result.data.data || []),
            ]);
          }
          setHasMore(result.data.hasMore || false);
          setOffset(currentOffset + 20);
        }
      } catch (error) {
        console.error("Error fetching transactions:", error);
      } finally {
        setLoading(false);
      }
    },
    [offset, startDate, finishDate]
  );

  useEffect(() => {
    fetchTransactions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => {
    setLoading(true);
    setOffset(0);
    fetchTransactions(true);
  };

  if (loading && transactions.length === 0) return <PageLoading />;

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

  const statusLabels: Record<string, string> = {
    PENDING: "Pendente",
    CONFIRMED: "Confirmado",
    CANCELLED: "Cancelado",
    FAILED: "Falhou",
    REFUNDED: "Estornado",
  };

  const exportCSV = () => {
    if (transactions.length === 0) return;
    const header = "Data,Tipo,Status,Descrição,Destinatário,Valor";
    const rows = transactions.map((tx) => {
      const isPositive = tx.type.includes("RECEIVED") || tx.type === "DEPOSIT" || tx.type === "BOLETO_PAID";
      return [
        formatDate(tx.date),
        typeLabels[tx.type] || tx.type,
        statusLabels[tx.status] || tx.status,
        `"${(tx.description || "").replace(/"/g, '""')}"`,
        `"${(tx.recipientName || "").replace(/"/g, '""')}"`,
        `${isPositive ? "" : "-"}${Math.abs(tx.amount).toFixed(2)}`,
      ].join(",");
    });
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-credbusiness-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (transactions.length === 0) return;
    const printWin = window.open("", "_blank", "width=800,height=600");
    if (!printWin) return;
    const rows = transactions
      .map((tx) => {
        const isPositive = tx.type.includes("RECEIVED") || tx.type === "DEPOSIT" || tx.type === "BOLETO_PAID";
        return `<tr>
          <td>${formatDate(tx.date)}</td>
          <td>${typeLabels[tx.type] || tx.type}</td>
          <td>${tx.recipientName || tx.description || "-"}</td>
          <td style="color:${isPositive ? "#22c55e" : "#ef4444"};font-weight:600;text-align:right">
            ${isPositive ? "+" : "−"} ${formatCurrency(Math.abs(tx.amount))}
          </td>
        </tr>`;
      })
      .join("");
    printWin.document.write(`<!DOCTYPE html><html><head><title>Extrato CredBusiness</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;color:#1e293b}
      .header{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #6366f1}
      .header h1{color:#6366f1;font-size:22px}.header p{color:#64748b;font-size:12px;margin-top:4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;text-align:left;padding:8px 12px;border-bottom:2px solid #e2e8f0}
      td{padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px}tr:hover{background:#fafafa}
      .footer{text-align:center;margin-top:24px;padding-top:16px;border-top:1px dashed #cbd5e1;color:#94a3b8;font-size:10px}
      @media print{body{padding:16px}}</style></head><body>
      <div class="header"><h1>CredBusiness</h1><p>Extrato de Transações — ${new Date().toLocaleDateString("pt-BR")}</p></div>
      <table><thead><tr><th>Data</th><th>Tipo</th><th>Destino/Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer"><p>${transactions.length} transações listadas</p><p>Documento gerado eletronicamente por CredBusiness</p></div>
      </body></html>`);
    printWin.document.close();
    printWin.focus();
    printWin.print();
  };

  return (
    <>
      <Toaster position="top-right" />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-xl p-2 text-slate-500 hover:bg-black/[0.04]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Extrato
              </h1>
              <p className="text-sm text-slate-500">
                Histórico completo de transações
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={exportCSV}
              size="sm"
              title="Exportar CSV"
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="ghost"
              onClick={exportPDF}
              size="sm"
              title="Exportar PDF"
            >
              <Download className="mr-1.5 h-4 w-4" />
              PDF
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <Input
                label="Data início"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                icon={<Calendar className="h-4 w-4" />}
              />
              <Input
                label="Data fim"
                type="date"
                value={finishDate}
                onChange={(e) => setFinishDate(e.target.value)}
                icon={<Calendar className="h-4 w-4" />}
              />
              <Button onClick={applyFilters} className="sm:mb-0">
                Aplicar
              </Button>
            </div>
          </Card>
        )}

        {/* Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Transações</CardTitle>
            <span className="text-sm text-slate-500">
              {transactions.length} transações
            </span>
          </CardHeader>
          <TransactionList transactions={transactions} />

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="ghost"
                onClick={() => fetchTransactions(false)}
                isLoading={loading}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
