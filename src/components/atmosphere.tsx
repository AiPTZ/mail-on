export function Atmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden="true">
      <div className="bg-grain absolute inset-0" />
      <div className="bg-grid absolute inset-0" />
      <div className="glow-orb absolute -top-32 right-[-10%] h-[520px] w-[520px]" />
      <div className="glow-orb-gold absolute left-[-15%] top-1/3 h-[460px] w-[460px]" />
      <div className="glow-orb absolute bottom-[-10%] left-1/3 h-[420px] w-[420px] opacity-60" />
    </div>
  );
}
