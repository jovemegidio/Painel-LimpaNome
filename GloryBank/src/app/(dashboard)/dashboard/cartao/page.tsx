"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft,
  CreditCard,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Lock,
  Wifi,
  Landmark,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageLoading } from "@/components/ui/loading";

interface CardData {
  id: string;
  cardType: string;
  status: string;
  lastFour: string | null;
  brand: string;
  cardName: string | null;
  requestedAt: string;
  approvedAt: string | null;
}

const statusLabels: Record<string, { label: string; variant: "success" | "warning" | "error" | "info" }> = {
  PENDING: { label: "Solicitado", variant: "warning" },
  APPROVED: { label: "Aprovado", variant: "info" },
  ACTIVE: { label: "Ativo", variant: "success" },
  BLOCKED: { label: "Bloqueado", variant: "error" },
};

export default function CartaoPage() {
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch("/api/card");
      const result = await res.json();
      if (result.success) setCards(result.data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const requestCard = async (cardType: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardType }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(
          cardType === "VIRTUAL"
            ? "Cartão virtual criado com sucesso!"
            : "Cartão físico solicitado! Aguarde aprovação."
        );
        setShowModal(false);
        fetchCards();
      } else {
        toast.error(result.error || "Erro ao solicitar cartão");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewCard = (card: CardData) => {
    setSelectedCard(card);
    setShowDetails(true);
  };

  if (loading) return <PageLoading />;

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
              <h1 className="text-2xl font-bold text-slate-800">Cartões</h1>
              <p className="text-sm text-slate-500">
                Gerencie seus cartões virtuais e físicos
              </p>
            </div>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Solicitar cartão
          </Button>
        </div>

        {/* Quick action: Pagar Fatura */}
        <Link href="/dashboard/cartao/fatura">
          <Card hover>
            <div className="flex items-center gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #818cf8)",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.2)",
                }}
              >
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[14px] font-bold text-slate-800">
                  Pagar ou Parcelar Fatura
                </p>
                <p className="text-[12px] text-slate-500">
                  Pague a fatura do seu cartão de crédito
                </p>
              </div>
            </div>
          </Card>
        </Link>

        {/* Cards List */}
        {cards.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div
                className="mb-3 rounded-full p-4"
                style={{ background: "rgba(0,0,0,0.03)" }}
              >
                <CreditCard className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-[13px] font-medium text-slate-500">
                Nenhum cartão solicitado
              </p>
              <p className="mt-1 text-[11px] text-slate-400 mb-4">
                Solicite seu cartão virtual ou físico CredBusiness
              </p>
              <Button onClick={() => setShowModal(true)} size="sm">
                Solicitar cartão
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {cards.map((card) => {
              const status = statusLabels[card.status] || statusLabels.PENDING;
              return (
                <div key={card.id} className="space-y-4">
                  {/* Card Visual */}
                  <div
                    className="relative overflow-hidden rounded-2xl p-6 text-white cursor-pointer transition-transform hover:scale-[1.02]"
                    style={{
                      background:
                        card.cardType === "VIRTUAL"
                          ? "linear-gradient(135deg, #1a1a2e 0%, #2d1b4e 50%, #1a1a2e 100%)"
                          : "linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #818cf8 100%)",
                      boxShadow:
                        card.cardType === "VIRTUAL"
                          ? "0 8px 32px rgba(45,27,78,0.4)"
                          : "0 8px 32px rgba(99,102,241,0.3)",
                      minHeight: "200px",
                    }}
                    onClick={() => viewCard(card)}
                  >
                    {/* Decorative */}
                    <div
                      className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full opacity-20"
                      style={{
                        background: "radial-gradient(circle, white, transparent 70%)",
                      }}
                    />

                    <div className="relative flex flex-col justify-between h-full min-h-[180px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Landmark className="h-5 w-5" />
                          <span className="text-sm font-bold tracking-wider">
                            CredBusiness
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Wifi className="h-4 w-4 rotate-90" />
                          <Badge
                            variant={status.variant}
                            size="sm"
                          >
                            {status.label}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-lg font-mono tracking-[0.2em]">
                          •••• •••• •••• {card.lastFour || "????"}
                        </p>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] uppercase text-white/60">
                              Titular
                            </p>
                            <p className="text-xs font-semibold tracking-wider">
                              {card.cardName || "NOME DO TITULAR"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase text-white/60">
                              Validade
                            </p>
                            <p className="text-xs font-semibold">12/29</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold italic">
                              {card.brand}
                            </p>
                            <p className="text-[10px] text-white/60">
                              {card.cardType === "VIRTUAL"
                                ? "Virtual"
                                : "Físico"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Request Card Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Solicitar Cartão"
        >
          <div className="space-y-4">
            <Card
              hover
              onClick={() => requestCard("VIRTUAL")}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
                  <CreditCard className="h-6 w-6 text-purple-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800">
                    Cartão Virtual
                  </h3>
                  <p className="text-sm text-slate-500">
                    Ativação instantânea para compras online
                  </p>
                </div>
              </div>
            </Card>

            <Card
              hover
              onClick={() => requestCard("PHYSICAL")}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
                  <CreditCard className="h-6 w-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800">
                    Cartão Físico
                  </h3>
                  <p className="text-sm text-slate-500">
                    Entrega em até 10 dias úteis
                  </p>
                </div>
              </div>
            </Card>

            {isSubmitting && (
              <p className="text-center text-sm text-slate-500">
                Processando solicitação...
              </p>
            )}
          </div>
        </Modal>

        {/* Card Details Modal */}
        <CardDetailsModal
          card={selectedCard}
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
        />
      </div>
    </>
  );
}

function CardDetailsModal({
  card,
  isOpen,
  onClose,
}: {
  card: CardData | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [showNumber, setShowNumber] = useState(false);
  const [showCvv, setShowCvv] = useState(false);

  if (!card) return null;

  const mockNumber = `5432 1098 7654 ${card.lastFour || "0000"}`;
  const mockCvv = "321";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes do Cartão">
      <div className="space-y-4">
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(0,0,0,0.03)" }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Número</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium">
                  {showNumber ? mockNumber : `•••• •••• •••• ${card.lastFour}`}
                </span>
                <button
                  onClick={() => setShowNumber(!showNumber)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {showNumber ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(mockNumber);
                    toast.success("Número copiado!");
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Validade</span>
              <span className="text-sm font-medium">12/2029</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">CVV</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium">
                  {showCvv ? mockCvv : "•••"}
                </span>
                <button
                  onClick={() => setShowCvv(!showCvv)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {showCvv ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Titular</span>
              <span className="text-sm font-medium">{card.cardName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Bandeira</span>
              <span className="text-sm font-medium">{card.brand}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Tipo</span>
              <span className="text-sm font-medium">
                {card.cardType === "VIRTUAL" ? "Virtual" : "Físico"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl p-3 bg-amber-50 border border-amber-200">
          <Lock className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-[12px] text-amber-700">
            Nunca compartilhe os dados do seu cartão com terceiros.
          </p>
        </div>

        <Button variant="outline" onClick={onClose} className="w-full">
          Fechar
        </Button>
      </div>
    </Modal>
  );
}
