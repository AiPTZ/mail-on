import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink px-6 text-center">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10">
        <div className="mb-6 flex justify-center">
          <Logo href="/" />
        </div>
        <p className="label !text-gold-500/80">404</p>
        <h1 className="mt-3 font-serif text-4xl font-bold text-cream">Pagina nao encontrada</h1>
        <Link href="/" className="btn btn-primary mt-8">
          Voltar
        </Link>
      </div>
    </div>
  );
}
