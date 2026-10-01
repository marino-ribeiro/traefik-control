import { redirect } from "next/navigation";
import { Header } from "@/components/shell/Header";
import { Footer } from "@/components/shell/Footer";
import { MobileNav } from "@/components/shell/Nav";
import { getSnapshot } from "@/lib/snapshot";
import { authDisabled, isAuthenticated } from "@/lib/auth";

/** Everything inside this group requires a session (when a password is set). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");

  const { snapshot, target } = await getSnapshot();

  return (
    <>
      <Header
        mock={snapshot?.mock ?? false}
        target={target}
        version={snapshot?.version?.Version}
        authed={!authDisabled()}
      />
      <div className="fixed inset-x-0 top-header z-[90] lg:hidden">
        <MobileNav />
      </div>
      {/* min-h-dvh + flex-1 no conteúdo: com pouca coisa na tela (um filtro
          que sobra uma linha), o rodapé fica no fim da viewport em vez de subir. */}
      <main className="flex min-h-dvh flex-col pt-[calc(var(--spacing-header)+56px)] lg:pt-header">
        <div className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-12 md:px-8">{children}</div>
        <Footer target={target} mock={snapshot?.mock ?? false} />
      </main>
    </>
  );
}
