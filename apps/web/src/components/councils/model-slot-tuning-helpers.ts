export function parseDecimalInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalizes OpenRouter top_p input to the contract-owned 0..1 interval. */
export function parseUnitIntervalInput(value: string): number | null {
  const parsed = parseDecimalInput(value);
  if (parsed === null) return null;
  return Math.min(1, Math.max(0, parsed));
}

export function parseIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
