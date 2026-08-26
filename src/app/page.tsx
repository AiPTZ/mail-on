import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  Flame,
  LayoutGrid,
  LogIn,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Atmosphere } from "@/components/atmosphere";
import { Logo } from "@/components/logo";

const DIFFERENTIALS = [
  {
    icon: Flame,
    title: "Aquecimento inteligente de dominio",
    desc: "O teto sobe sozinho: 50, 200, 500, 2 mil, 10 mil por dia. Se bounce passar de 2% ou complaint de 0,08%, o volume congela. A reputacao nao atravessa workspaces.",
  },
  {
    icon: ShieldCheck,
    title: "Disparos sem queimar o dominio",
    desc: "From sempre em mail.cliente.com. Sem mascara, sem subdominio da agencia. Bounce, complaint e unsubscribe saem da base na hora. List-Unsubscribe em todo envio.",
  },
  {
    icon: Workflow,
    title: "Cadencias de campanha",
    desc: "Sequencia de ate 3 emails com delay em dias. Enrollment manual: voce escolhe a lista e inicia. Sem automacao cega em base suja.",
  },
  {
    icon: LayoutGrid,
    title: "Personalizacao em blocos",
    desc: "Unlayer no painel. O cliente arrasta blocos, troca texto e imagem, salva o HTML. A agencia deixa de ser o gargalo do design.",
  },
];

const STEPS = [
  {
    title: "Crie o workspace",
    desc: "A agencia provisiona o cliente e o subdominio autenticado: mail.cliente.com.",
  },
  {
    title: "Cole os registros DNS",
    desc: "SPF, DKIM e tracking. Nada sai sem dominio verified.",
  },
  {
    title: "From no dominio do cliente",
    desc: "Inbox mostra o remetente real. Sem via agencia. Sem mascara.",
  },
  {
    title: "Importe, monte e dispare",
    desc: "Planilha XLSX, editor Unlayer, campanha ou sequencia. A agencia autentica; o cliente opera.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-ink">
      <Atmosphere />

      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-gold-500 focus:px-3 focus:py-2 focus:text-ink"
      >
        Ir para o conteudo
      </a>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Logo />
        <Link href="/login" className="btn btn-primary">
          <LogIn className="h-4 w-4" />
          Acessar painel
        </Link>
      </header>

      <main id="conteudo" className="relative z-10">
        <section className="mx-auto max-w-4xl px-5 pb-16 pt-10 text-center sm:pt-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/5 px-4 py-1.5 text-xs font-medium text-gold-400">
            <Sparkles className="h-3.5 w-3.5" />
            Email marketing no dominio autenticado do cliente
          </div>
          <h1 className="font-serif text-4xl font-bold leading-tight text-cream sm:text-6xl">
            Escala, entrega e reputacao.{" "}
            <span className="gold-gradient-text">Sem queimar o dominio.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-cream/60 sm:text-lg">
            Mail ON e o disparador da agencia: aquecimento, cadencia e editor em blocos, com o From
            sempre em <span className="text-cream">@mail.cliente.com</span>.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn btn-primary px-6 py-3 text-base">
              Comecar agora
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#sobre" className="btn btn-secondary px-6 py-3 text-base">
              Sobre o Mail ON
            </a>
          </div>
          <div className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-3 text-center">
            {[
              { value: "1 / cliente", label: "Dominio isolado" },
              { value: "50 → 10k", label: "Warmup diario" },
              { value: "Unlayer", label: "Editor em blocos" },
            ].map((item) => (
              <div key={item.label} className="card px-3 py-4">
                <div className="gold-gradient-text font-serif text-xl font-bold sm:text-2xl">{item.value}</div>
                <div className="mt-1 text-[11px] leading-tight text-cream/45 sm:text-xs">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="sobre" className="mx-auto max-w-4xl px-5 py-14">
          <div className="card gold-frame p-8 sm:p-10">
            <p className="label !text-gold-500/80">Sobre o Mail ON</p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-cream sm:text-4xl">
              Eficiencia, seguranca e entrega na caixa de entrada
            </h2>
            <p className="mt-5 text-base leading-relaxed text-cream/60">
              Mail ON e a ferramenta da agencia que precisa de performance sem queimar dominio.
              Cada cliente dispara so do subdominio autenticado dele. SPF, DKIM e warmup ficam no
              workspace. Se um cliente cair, os outros continuam vivos.
            </p>
            <p className="mt-4 text-base leading-relaxed text-cream/60">
              A agencia provisiona o DNS. O cliente importa a base, monta o email em blocos e
              dispara. Nada sai sem dominio verified. Bounce e complaint saem da lista na hora.
            </p>
          </div>
        </section>

        <section id="diferenciais" className="mx-auto max-w-6xl px-5 py-14">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="label !text-gold-500/80">Nossos diferenciais</p>
            <h2 className="font-serif text-3xl font-bold text-cream sm:text-4xl">
              O que protege a reputacao
            </h2>
            <p className="mt-4 text-cream/55">
              Aquecimento, isolamento de dominio, cadencia e editor. O restante e disciplina de envio.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {DIFFERENTIALS.map((f) => (
              <div key={f.title} className="card group p-6">
                <div className="icon-gold mb-4 transition-transform duration-300 group-hover:scale-110">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-cream">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream/50">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="mx-auto max-w-4xl px-5 py-14">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="label !text-gold-500/80">Como opera</p>
            <h2 className="font-serif text-3xl font-bold text-cream sm:text-4xl">Do DNS ao primeiro disparo</h2>
            <p className="mt-4 text-cream/55">
              A agencia autentica. O cliente edita e dispara.
            </p>
          </div>
          <ol className="relative space-y-8 before:absolute before:bottom-2 before:left-[22px] before:top-2 before:w-px before:bg-gradient-to-b before:from-gold-500/50 before:via-gold-500/20 before:to-transparent">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative flex gap-5">
                <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold-500/40 bg-ink-800 font-serif text-lg font-bold text-gold-400 shadow-[0_0_18px_-4px_rgba(212,175,55,0.5)]">
                  {i + 1}
                </div>
                <div className="card flex-1 p-5">
                  <h3 className="font-semibold text-cream">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-cream/50">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-16 text-center">
          <Fingerprint className="mx-auto mb-5 h-8 w-8 text-gold-400" aria-hidden="true" />
          <h2 className="font-serif text-3xl font-bold text-cream">
            Campanhas com escala e{" "}
            <span className="gold-gradient-text">a reputacao intacta.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/55">
            Com o Mail ON, o disparo ganha cadencia, profissionalismo e entrega no dominio do
            cliente — sem queimar o da agencia.
          </p>
          <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-cream/60">
            {[
              "From autenticado no subdominio do cliente",
              "Warmup diario com trava de bounce e complaint",
              "Editor Unlayer e sequencia de 3 passos",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                {item}
              </li>
            ))}
          </ul>
          <Link href="/login" className="btn btn-primary mt-8 px-8 py-3 text-base">
            Entrar no produto
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <footer className="relative z-10 border-t border-ink-400/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-cream/35 sm:flex-row">
          <div>Mail ON — envio autenticado para agencias</div>
          <div className="flex items-center gap-5">
            <a href="#sobre" className="transition-colors hover:text-gold-400">
              Sobre
            </a>
            <a href="#diferenciais" className="transition-colors hover:text-gold-400">
              Diferenciais
            </a>
            <Link href="/login" className="transition-colors hover:text-gold-400">
              Entrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
