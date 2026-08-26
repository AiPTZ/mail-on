export function warmupCapForDay(day: number): number {
  if (day <= 3) return 50;
  if (day <= 7) return 200;
  if (day <= 14) return 500;
  if (day <= 21) return 2000;
  return 10000;
}

export function canRaiseWarmup(bounceRate: number, complaintRate: number): boolean {
  return bounceRate < 0.02 && complaintRate < 0.0008;
}
