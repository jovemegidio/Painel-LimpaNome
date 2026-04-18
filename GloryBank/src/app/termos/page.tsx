import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, FileText, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Termos de Uso | CredBusiness",
  description: "Termos de Uso do CredBusiness — condições para utilização dos serviços financeiros.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/login" className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: "linear-gradient(135deg, #6366f1, #818cf8)" }}
            >
              <Landmark className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="font-bold text-slate-800">
              Cred<span className="text-indigo-500">Business</span>
            </span>
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <FileText className="h-8 w-8 text-indigo-500" />
          <h1 className="text-3xl font-bold text-slate-800">Termos de Uso</h1>
        </div>

        <p className="mb-2 text-sm text-slate-500">
          Última atualização: abril de 2026
        </p>

        <div className="prose prose-slate max-w-none space-y-6 text-[15px] leading-relaxed text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-800">1. Aceite dos Termos</h2>
            <p>
              Ao criar uma conta ou utilizar os serviços do CredBusiness, você concorda com estes
              Termos de Uso e com nossa{" "}
              <Link href="/privacidade" className="font-medium text-indigo-500 hover:underline">
                Política de Privacidade
              </Link>
              . Caso não concorde, não utilize o serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">2. Serviços Financeiros — Asaas</h2>
            <p>
              Os serviços financeiros disponíveis no CredBusiness (conta digital, PIX, boletos e
              transferências) são fornecidos pela{" "}
              <a
                href="https://www.asaas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-500 hover:underline"
              >
                Asaas Pagamentos S.A.
              </a>
              , Instituição de Pagamento autorizada pelo Banco Central do Brasil (BACEN) sob o
              modelo de Banking as a Service (BaaS). O CredBusiness atua como plataforma intermediária.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">3. Elegibilidade</h2>
            <ul className="ml-6 list-disc space-y-1">
              <li>Ter 18 anos ou mais</li>
              <li>Possuir CPF ou CNPJ válido e regular na Receita Federal</li>
              <li>Fornecer informações verdadeiras e atualizadas no cadastro</li>
              <li>Não estar impedido por lei de contratar serviços financeiros</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">4. Responsabilidades do Usuário</h2>
            <ul className="ml-6 list-disc space-y-1">
              <li>Manter confidencialidade de senha e credenciais de acesso</li>
              <li>Notificar imediatamente em caso de acesso não autorizado</li>
              <li>Não utilizar os serviços para atividades ilícitas ou fraudulentas</li>
              <li>Cumprir as normas do Banco Central do Brasil relativas ao PIX e pagamentos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">5. Limitações e Disponibilidade</h2>
            <p>
              O CredBusiness e o Asaas podem impor limites de operações diárias, suspender
              ou encerrar contas que violem estes termos ou apresentem indícios de fraude,
              conforme exigido pela regulação vigente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">6. Tarifas</h2>
            <p>
              Tarifas incidentes sobre as operações seguem a tabela do Asaas. Transferências PIX
              podem ter custo conforme o plano contratado. Consulte a tabela atualizada em{" "}
              <a
                href="https://www.asaas.com/tarifas"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-500 hover:underline"
              >
                asaas.com/tarifas
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">7. Contato e Suporte</h2>
            <p>
              Para suporte ou dúvidas:{" "}
              <a href="mailto:suporte@credbusiness.com.br" className="font-medium text-indigo-500 hover:underline">
                suporte@credbusiness.com.br
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
