"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, Landmark } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AsaasBadge } from "@/components/ui/asaas-badge";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!result.success) {
        toast.error(result.error || "Erro ao fazer login");
        return;
      }

      toast.success("Login realizado com sucesso!");
      router.push("/dashboard");
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsDemo = () => {
    onSubmit({ email: "demo@credbusiness.com", password: "Demo@123456" });
  };

  return (
    <>
      <Toaster position="top-right" />
      <div>
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden"
            style={{
              background: "transparent",
            }}
          >
            <img src="/favicon.png" alt="CredBusiness" className="h-8 w-8 object-contain" />
          </div>
          <span className="text-xl font-bold text-slate-800">
            Cred<span className="text-indigo-500">Business</span>
          </span>
        </div>

        <div className="mb-7">
          <h2 className="text-[1.6rem] font-bold tracking-tight text-slate-800">
            Acesse sua conta
          </h2>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Internet Banking — CredBusiness
          </p>
        </div>

        {/* Demo credentials banner */}
        <div
          className="mb-6 rounded-xl p-4"
          style={{
            background: "rgba(99,102,241,0.04)",
            border: "1px solid rgba(99,102,241,0.12)",
          }}
        >
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
            Conta de Demonstração
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[12px] text-slate-500">
                <span className="text-slate-400">Login: </span>
                <span className="font-mono font-medium text-slate-700">demo@credbusiness.com</span>
              </p>
              <p className="text-[12px] text-slate-500">
                <span className="text-slate-400">Senha: </span>
                <span className="font-mono font-medium text-slate-700">Demo@123456</span>
              </p>
            </div>
            <button
              type="button"
              onClick={loginAsDemo}
              disabled={isLoading}
              className="shrink-0 rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-all hover:opacity-85 disabled:opacity-50 active:scale-95"
              style={{ background: "linear-gradient(135deg, #6366f1, #818cf8)" }}
            >
              Entrar como Demo
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            icon={<Mail className="h-4 w-4" />}
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Senha"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            icon={<Lock className="h-4 w-4" />}
            error={errors.password?.message}
            {...register("password")}
          />

          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full"
            size="lg"
          >
            Entrar na conta
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-slate-500">
          Ainda não tem conta?{" "}
          <Link
            href="/register"
            className="font-semibold text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            Criar conta grátis
          </Link>
        </p>

        <div className="mt-6">
          <AsaasBadge variant="inline" />
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Ao entrar, você concorda com os{" "}
          <Link href="/termos" className="underline hover:text-slate-600">Termos de Uso</Link>
          {" "}e a{" "}
          <Link href="/privacidade" className="underline hover:text-slate-600">Política de Privacidade</Link>.
        </p>
      </div>
    </>
  );
}
