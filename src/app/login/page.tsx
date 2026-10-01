import { redirect } from "next/navigation";
import { authDisabled, isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (authDisabled() || (await isAuthenticated())) redirect("/");

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-20">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 flex items-baseline justify-center gap-1.5">
          <span className="text-[28px] font-black -tracking-[0.5px] text-fg">TRAEFIK</span>
          <span aria-hidden className="relative top-[3px] inline-block h-5 w-[2px] bg-red" />
          <span className="text-[16px] font-normal uppercase tracking-[0.22em] text-muted">Control</span>
        </div>

        <div className="glass rounded-panel px-8 py-9 shadow-lift">
          <span className="eyebrow block">Acesso restrito</span>
          <h1 className="title-black title-fade mt-2 mb-2 text-[30px]">Entrar</h1>
          <p className="mb-7 text-[14px] leading-relaxed text-muted">
            Este painel altera a configuração do Traefik. Informe a senha para continuar.
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
