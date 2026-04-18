import { Landmark, ShieldCheck, Zap, Clock } from "lucide-react";
import { AsaasBadge } from "@/components/ui/asaas-badge";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen" style={{ background: "#f5f6f8" }}>
      {/* Left side — branding panel (desktop only) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 items-center justify-center p-12 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(160deg, #4338ca 0%, #6366f1 50%, #818cf8 100%)",
          }}
        />
        {/* Decorative glows */}
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 65%)" }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-sm text-center">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.2)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              }}
            >
              <Landmark className="h-8 w-8 text-white" strokeWidth={1.75} />
            </div>
          </div>

          <h1 className="mb-2 text-4xl font-bold tracking-tight text-white">
            Cred<span className="text-white/80">Business</span>
          </h1>
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-widest text-white/70">
            Internet Banking Digital
          </p>
          <p className="mb-10 text-[15px] leading-relaxed text-white/70">
            Sua conta digital completa. PIX, boletos e transferências com
            segurança de nível bancário.
          </p>

          {/* Stat pills */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { Icon: Zap, label: "PIX", sub: "Instantâneo" },
              { Icon: Clock, label: "24/7", sub: "Disponível" },
              { Icon: ShieldCheck, label: "Seguro", sub: "AES-256" },
            ].map(({ Icon, label, sub }) => (
              <div
                key={label}
                className="rounded-xl p-4"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <Icon className="h-5 w-5 text-white mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-white">{label}</p>
                <p className="text-[10px] text-white/50">{sub}</p>
              </div>
            ))}
          </div>

          {/* Asaas BaaS attribution — required by Asaas BaaS agreement */}
          <div className="mt-8">
            <AsaasBadge variant="inline" dark />
          </div>
        </div>
      </div>

      {/* Right side — form */}
      <div
        className="flex w-full lg:w-[55%] xl:w-1/2 items-start lg:items-center justify-center p-5 sm:p-8 pt-10 sm:pt-8"
        style={{ background: "#f9fafb" }}
      >
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}

