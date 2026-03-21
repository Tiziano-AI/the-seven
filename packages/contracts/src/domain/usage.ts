const USD_MICROS_PER_USD = 1_000_000;
const USD_STRING_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

export type MoneyParseResult =
  | Readonly<{ ok: true; micros: number }>
  | Readonly<{ ok: false; reason: "empty" | "invalid" }>;

export function tryParseUsdToMicros(value: string | number | null | undefined): MoneyParseResult {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false, reason: "invalid" };
    }
    return tryParseUsdToMicros(String(value));
  }
  if (!value) {
    return { ok: false, reason: "empty" };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  const match = trimmed.match(USD_STRING_RE);
  if (!match) {
    return { ok: false, reason: "invalid" };
  }

  const [, signPart, dollarsPart, fractionPart = ""] = match;
  const sign = signPart === "-" ? -1 : 1;
  const dollars = Number.parseInt(dollarsPart, 10);
  if (!Number.isFinite(dollars)) {
    return { ok: false, reason: "invalid" };
  }

  const padded = `${fractionPart}0000000`.slice(0, 7);
  const microsDigits = padded.slice(0, 6);
  const roundingDigit = padded.slice(6, 7);

  let micros = Number.parseInt(microsDigits, 10);
  if (!Number.isFinite(micros)) {
    micros = 0;
  }
  if (roundingDigit >= "5") {
    micros += 1;
  }

  let normalizedDollars = dollars;
  let normalizedMicros = micros;
  if (normalizedMicros >= USD_MICROS_PER_USD) {
    normalizedDollars += 1;
    normalizedMicros -= USD_MICROS_PER_USD;
  }

  return {
    ok: true,
    micros: sign * (normalizedDollars * USD_MICROS_PER_USD + normalizedMicros),
  };
}

export function parseUsdAmountToMicros(value: string | number | null | undefined): number | null {
  const parsed = tryParseUsdToMicros(value);
  return parsed.ok ? parsed.micros : null;
}

export function formatUsdFromMicros(micros: number, decimals: 0 | 2 | 4 | 6 = 6): string {
  const integerMicros = Number.isFinite(micros) ? Math.trunc(micros) : 0;
  const sign = integerMicros < 0 ? "-" : "";
  const absoluteMicros = Math.abs(integerMicros);
  const dollars = Math.floor(absoluteMicros / USD_MICROS_PER_USD);
  const remainder = absoluteMicros % USD_MICROS_PER_USD;

  if (decimals === 0) {
    return `${sign}${dollars}`;
  }

  const scale = 10 ** (6 - decimals);
  const fraction = Math.floor(remainder / scale);
  return `${sign}${dollars}.${String(fraction).padStart(decimals, "0")}`;
}

export type OpenRouterUsageSummary = Readonly<{
  totalTokens: number;
  totalCostUsdMicros: number;
  costIsPartial: boolean;
}>;

export function summarizeUsage(
  values: ReadonlyArray<
    Readonly<{ usageTotalTokens: number | null; totalCostUsdMicros: number | null }>
  >,
): OpenRouterUsageSummary {
  let totalTokens = 0;
  let totalCostUsdMicros = 0;
  let costIsPartial = false;

  for (const value of values) {
    if (typeof value.usageTotalTokens === "number") {
      totalTokens += value.usageTotalTokens;
    }
    if (typeof value.totalCostUsdMicros === "number") {
      totalCostUsdMicros += value.totalCostUsdMicros;
    } else {
      costIsPartial = true;
    }
  }

  return { totalTokens, totalCostUsdMicros, costIsPartial };
}
