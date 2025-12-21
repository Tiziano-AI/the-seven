const STORAGE_KEY = "seven.query_draft";

function readStorageValue(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function readQueryDraft(): string {
  return readStorageValue() ?? "";
}

export function writeQueryDraft(value: string): void {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, value);
}

export function clearQueryDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
