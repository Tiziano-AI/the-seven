export type UsdLike = string | null | undefined;
export type TokensLike = number | null | undefined;

export type CostRow = Readonly<{ cost: UsdLike }>;
export type TokensRow = Readonly<{ tokensUsed: TokensLike }>;

const USD_MICROS_PER_USD = 1_000_000;
const USD_STRING_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

export type MoneyParseResult =
  | Readonly<{ ok: true; micros: number }>
  | Readonly<{ ok: false; reason: "empty" | "invalid" }>;

export function tryParseUsdToMicros(value: UsdLike): MoneyParseResult {
  if (!value) return { ok: false, reason: "empty" };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const match = trimmed.match(USD_STRING_RE);
  if (!match) return { ok: false, reason: "invalid" };

  const sign = match[1] === "-" ? -1 : 1;
  const dollarsRaw = match[2];
  const fractionRaw = match[3] ?? "";

  const dollars = Number.parseInt(dollarsRaw, 10);
  if (!Number.isFinite(dollars)) return { ok: false, reason: "invalid" };

  const padded = (fractionRaw + "0000000").slice(0, 7);
  const microsDigits = padded.slice(0, 6);
  const roundingDigit = padded.slice(6, 7);

  let micros = Number.parseInt(microsDigits, 10);
  if (!Number.isFinite(micros)) micros = 0;

  if (roundingDigit >= "5") {
    micros += 1;
  }

  let normalizedDollars = dollars;
  let normalizedMicros = micros;
  if (normalizedMicros >= USD_MICROS_PER_USD) {
    normalizedDollars += 1;
    normalizedMicros -= USD_MICROS_PER_USD;
  }

  const total = normalizedDollars * USD_MICROS_PER_USD + normalizedMicros;
  return { ok: true, micros: sign * total };
}

export function parseUsdToMicros(value: UsdLike): number {
  const parsed = tryParseUsdToMicros(value);
  return parsed.ok ? parsed.micros : 0;
}

export function parseUsdNumberToMicros(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const parsed = tryParseUsdToMicros(String(value));
  return parsed.ok ? parsed.micros : null;
}

export function parseUsdAmountToMicros(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return parseUsdNumberToMicros(value);
  }
  if (typeof value === "string") {
    const parsed = tryParseUsdToMicros(value);
    return parsed.ok ? parsed.micros : null;
  }
  return null;
}

export function sumCostRowsUsdMicros(rows: ReadonlyArray<CostRow>): number {
  let sum = 0;
  for (const row of rows) {
    sum += parseUsdToMicros(row.cost);
  }
  return sum;
}

export function sumTokensUsed(rows: ReadonlyArray<TokensRow>): number {
  let sum = 0;
  for (const row of rows) {
    if (typeof row.tokensUsed === "number" && Number.isFinite(row.tokensUsed)) {
      sum += row.tokensUsed;
    }
  }
  return sum;
}

export function formatUsdFromMicros(
  micros: number,
  decimals: 0 | 2 | 4 | 6 = 6
): string {
  if (!Number.isFinite(micros)) {
    return decimals === 0 ? "0" : `0.${"0".repeat(decimals)}`;
  }

  const integerMicros = Math.trunc(micros);
  const signLabel = integerMicros < 0 ? "-" : "";
  const absMicros = Math.abs(integerMicros);

  const roundingUnit = 10 ** (6 - decimals);
  const roundedMicros =
    roundingUnit === 1
      ? absMicros
      : Math.floor((absMicros + roundingUnit / 2) / roundingUnit) * roundingUnit;

  const dollars = Math.floor(roundedMicros / USD_MICROS_PER_USD);
  const remainderMicros = roundedMicros % USD_MICROS_PER_USD;

  if (decimals === 0) {
    return `${signLabel}${dollars}`;
  }

  const fractionScale = 10 ** (6 - decimals);
  const fraction = Math.floor(remainderMicros / fractionScale);
  return `${signLabel}${dollars}.${String(fraction).padStart(decimals, "0")}`;
}

/**
 * Minimal OpenRouter call shape for cost/token aggregation.
 */
export type OpenRouterCallUsage = Readonly<{
  responseId: string | null;
  usageTotalTokens: number | null;
  totalCostUsdMicros: number | null;
}>;

/**
 * Aggregated token and cost totals for OpenRouter calls.
 */
export type OpenRouterUsageSummary = Readonly<{
  totalTokens: number;
  totalCostUsdMicros: number;
  costIsPartial: boolean;
}>;

/**
 * Summarizes OpenRouter usage totals for tokens and cost.
 */
export function summarizeOpenRouterCalls(
  calls: ReadonlyArray<OpenRouterCallUsage>
): OpenRouterUsageSummary {
  let totalTokens = 0;
  let totalCostUsdMicros = 0;
  let costIsPartial = false;

  for (const call of calls) {
    if (typeof call.usageTotalTokens === "number" && Number.isFinite(call.usageTotalTokens)) {
      totalTokens += call.usageTotalTokens;
    }
    if (typeof call.totalCostUsdMicros === "number" && Number.isFinite(call.totalCostUsdMicros)) {
      totalCostUsdMicros += call.totalCostUsdMicros;
    } else if (call.responseId) {
      costIsPartial = true;
    }
  }

  return { totalTokens, totalCostUsdMicros, costIsPartial };
}
