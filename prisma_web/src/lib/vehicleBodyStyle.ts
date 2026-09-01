const SUV_MPV_NEEDLES = [
  "suv",
  "mpv",
  "sport utility",
  "people carrier",
  "multi-purpose",
  "4x4",
  "four wheel",
  "4 wheel",
  "crossover",
];

export function vehicleBodyStyleRequiresSuvMpvSurcharge(
  bodyStyle: string | null | undefined,
): boolean {
  if (bodyStyle == null || typeof bodyStyle !== "string") return false;
  const n = bodyStyle.trim().toLowerCase();
  if (!n) return false;
  return SUV_MPV_NEEDLES.some((kw) => n.includes(kw));
}
