"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, User, Phone, CreditCard, Wallet } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { registerSchema, type RegisterInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AsaasBadge } from "@/components/ui/asaas-badge";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!result.success) {
        if (result.errors) {
          Object.values(result.errors)
            .flat()
            .forEach((err) => toast.error(err as string));
        } else {
          toast.error(result.error || "Erro ao criar conta");
        }
        return;
      }

      toast.success("Conta criada com sucesso!");
      router.push("/dashboard");
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      <div>
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(99,102,241,0.06)" }}>
            <Wallet className="h-5 w-5 text-indigo-500" />
          </div>
          <span className="text-xl font-bold text-slate-800">
            Cred<span className="text-indigo-500">Business</span>
          </span>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800">
            Criar sua conta
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Abra sua conta digital em poucos minutos
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nome completo"
            placeholder="João da Silva"
            icon={<User className="h-4 w-4" />}
            error={errors.name?.message}
            {...register("name")}
          />

          <Input
            label="Email"
            type="email"
            placeholder="seu@email.com"
            icon={<Mail className="h-4 w-4" />}
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="CPF/CNPJ"
            placeholder="000.000.000-00"
            icon={<CreditCard className="h-4 w-4" />}
            error={errors.cpfCnpj?.message}
            {...register("cpfCnpj")}
          />

          <Input
            label="Telefone"
            placeholder="(11) 99999-9999"
            icon={<Phone className="h-4 w-4" />}
            error={errors.phone?.message}
            {...register("phone")}
          />

          <Input
            label="Senha"
            type="password"
            placeholder="Min. 8 caracteres"
            icon={<Lock className="h-4 w-4" />}
            error={errors.password?.message}
            {...register("password")}
          />

          <Input
            label="Confirmar senha"
            type="password"
            placeholder="Repita a senha"
            icon={<Lock className="h-4 w-4" />}
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />

          <div className="pt-2">
            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full"
              size="lg"
            >
              Criar conta
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Já tem uma conta?{" "}
          <Link
            href="/login"
            className="font-semibold text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            Entrar
          </Link>
        </p>

        <div className="mt-6">
          <AsaasBadge variant="inline" />
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Ao criar conta, você concorda com os{" "}
          <Link href="/termos" className="underline hover:text-slate-600">Termos de Uso</Link>
          {" "}e a{" "}
          <Link href="/privacidade" className="underline hover:text-slate-600">Política de Privacidade</Link>.
        </p>
      </div>
    </>
  );
}
