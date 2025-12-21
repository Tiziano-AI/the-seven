import { decodeCouncilRef } from "@/features/councils/domain/councilRef";

const STORAGE_KEY = "seven.last_council_ref";

function readStorageValue(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function readLastCouncilValue(): string | null {
  const raw = readStorageValue();
  if (!raw) return null;
  return decodeCouncilRef(raw) ? raw : null;
}

export function writeLastCouncilValue(value: string): void {
  if (typeof window === "undefined") return;
  if (!decodeCouncilRef(value)) return;
  window.localStorage.setItem(STORAGE_KEY, value);
}

export function clearLastCouncilValue(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
