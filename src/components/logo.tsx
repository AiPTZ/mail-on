import Link from "next/link";

export function Logo({
  size = "md",
  href = "/",
}: {
  size?: "sm" | "md" | "lg";
  href?: string;
}) {
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl";
  const mark = (
    <div className="flex select-none items-baseline">
      <span className={`font-serif font-semibold tracking-tight text-cream ${text}`}>Mail</span>
      <span className={`font-serif font-bold italic gold-gradient-text ${text}`}>ON</span>
    </div>
  );
  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex">
      {mark}
    </Link>
  );
}
