export function formatSuvPercent(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function suvExtraCopy(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) {
    return "Additional surcharge for SUV / MPV cleaning";
  }
  return `Additional ${formatSuvPercent(percent)}% surcharge for SUV / MPV cleaning`;
}

export function suvRequiredCopy(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) {
    return "This vehicle's registered body style requires the SUV / MPV option.";
  }
  return `This vehicle's registered body style requires the SUV / MPV option (${formatSuvPercent(percent)}% surcharge).`;
}

export function suvLineCopy(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) return "SUV / MPV";
  return `SUV / MPV (${formatSuvPercent(percent)}%)`;
}
