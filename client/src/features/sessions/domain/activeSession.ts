const STORAGE_KEY = "seven.active_session_id";

function readStorageValue(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function readActiveSessionId(): number | null {
  const raw = readStorageValue();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function writeActiveSessionId(sessionId: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(sessionId) || sessionId <= 0) return;
  window.localStorage.setItem(STORAGE_KEY, String(sessionId));
}

export function clearActiveSessionId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
