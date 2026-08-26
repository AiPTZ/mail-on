import Link from "next/link";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { loginAction } from "@/lib/actions";
import { Logo } from "@/components/logo";
import { Input } from "@/components/ui";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { error } = searchParams;
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-ink px-4">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="glow-orb pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full" aria-hidden="true" />
      <div className="glow-orb-gold pointer-events-none absolute -bottom-48 -left-32 h-[26rem] w-[26rem] rounded-full opacity-40" aria-hidden="true" />
      <div className="bg-grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>
        <p className="mt-2 text-center font-serif text-lg text-cream/50">
          Disparo autenticado no dominio do cliente
        </p>

        <div className="gold-frame card mt-8 p-8 backdrop-blur-sm">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/40 bg-gold-500/10 shadow-[0_0_24px_rgba(212,175,55,0.25)]">
              <ShieldCheck className="h-5 w-5 text-gold-400" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold text-cream">Entrar na sua conta</h1>
              <p className="text-xs text-cream/40">Acesso ao painel do Mail ON</p>
            </div>
          </div>

          <form action={loginAction} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="label">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-500/70" />
                <Input
                  id="login-email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  required
                  defaultValue="arcanjo"
                  className="!pl-10"
                  placeholder="Usuario ou email"
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="label">
                Senha
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-500/70" />
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="!pl-10"
                  placeholder="Sua senha"
                />
              </div>
            </div>
            {error ? (
              <p className="text-sm text-red-400" role="alert">
                Email ou senha invalidos.
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary w-full !py-3">
              Entrar
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-5 space-y-2 border-t border-ink-400 pt-5 text-xs leading-6 text-cream/40">
            <p>Admin: arcanjo</p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-cream/30">
          <Link href="/" className="hover:text-gold-400">
            Voltar ao inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
