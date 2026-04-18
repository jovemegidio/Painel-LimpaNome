import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, ShieldCheck, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Política de Privacidade | CredBusiness",
  description: "Política de Privacidade do CredBusiness — como coletamos, usamos e protegemos seus dados pessoais.",
};

export default function PrivacyPage() {
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
          <ShieldCheck className="h-8 w-8 text-indigo-500" />
          <h1 className="text-3xl font-bold text-slate-800">Política de Privacidade</h1>
        </div>

        <p className="mb-2 text-sm text-slate-500">
          Última atualização: abril de 2026
        </p>

        <div className="prose prose-slate max-w-none space-y-6 text-[15px] leading-relaxed text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-800">1. Sobre o CredBusiness e o Asaas</h2>
            <p>
              O CredBusiness é uma plataforma de internet banking digital que utiliza a infraestrutura de
              Banking as a Service (BaaS) da{" "}
              <a
                href="https://www.asaas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-500 hover:underline"
              >
                Asaas Pagamentos S.A.
              </a>
              , Instituição de Pagamento autorizada e regulada pelo Banco Central do Brasil (BACEN).
              Os serviços financeiros (contas digitais, PIX, boletos, transferências) são prestados
              pelo Asaas, enquanto o CredBusiness provê a interface e experiência ao usuário final.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">2. Dados Coletados</h2>
            <p>Coletamos os seguintes dados para prestação dos serviços:</p>
            <ul className="ml-6 list-disc space-y-1">
              <li>Dados de identificação: nome completo, CPF/CNPJ, data de nascimento</li>
              <li>Dados de contato: e-mail, telefone</li>
              <li>Dados de endereço: logradouro, CEP, cidade, estado</li>
              <li>Dados financeiros: histórico de transações, saldo (tratados pelo Asaas)</li>
              <li>Dados de acesso: endereço IP, user agent, data/hora de login</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">3. Finalidade do Tratamento</h2>
            <ul className="ml-6 list-disc space-y-1">
              <li>Abertura e gestão de conta digital via Asaas</li>
              <li>Processamento de transações financeiras (PIX, boleto, TED)</li>
              <li>Prevenção a fraudes e segurança das operações</li>
              <li>Cumprimento de obrigações legais e regulatórias (LGPD, BACEN)</li>
              <li>Comunicações sobre a conta e atualizações do serviço</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">4. Compartilhamento de Dados</h2>
            <p>
              Seus dados são compartilhados com a Asaas Pagamentos S.A. para viabilizar os serviços
              financeiros. O Asaas possui política de privacidade própria, disponível em{" "}
              <a
                href="https://www.asaas.com/politica-privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-500 hover:underline"
              >
                asaas.com/politica-privacidade
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">5. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo
              criptografia em trânsito (TLS 1.3), hashing de senhas (bcrypt), autenticação em
              duas etapas (2FA), sessões com expiração automática e controle de acesso por IP.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">6. Seus Direitos (LGPD)</h2>
            <p>
              Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a
              acessar, corrigir, portar ou solicitar a exclusão dos seus dados. Para exercer esses
              direitos, entre em contato pelo e-mail:{" "}
              <a href="mailto:privacidade@credbusiness.com.br" className="font-medium text-indigo-500 hover:underline">
                privacidade@credbusiness.com.br
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-800">7. Contato</h2>
            <p>
              Dúvidas sobre esta política podem ser enviadas para{" "}
              <a href="mailto:privacidade@credbusiness.com.br" className="font-medium text-indigo-500 hover:underline">
                privacidade@credbusiness.com.br
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
