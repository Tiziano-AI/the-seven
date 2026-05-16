export const ACTIVE_SESSION_ID_KEY = "seven.active_session_id";
export const DRAFT_QUERY_KEY = "seven.draft.query";
export const LAST_COUNCIL_REF_KEY = "seven.last_council_ref";
export const FOUNDING_COUNCIL_CHOICE = "built_in:founding";

export function readActiveSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(ACTIVE_SESSION_ID_KEY);
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function writeActiveSessionId(sessionId: number | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (sessionId === null) {
    window.localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_SESSION_ID_KEY, String(sessionId));
}

export function readDraftQuery() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(DRAFT_QUERY_KEY) ?? "";
}

export function writeDraftQuery(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  if (!value.trim()) {
    window.localStorage.removeItem(DRAFT_QUERY_KEY);
    return;
  }
  window.localStorage.setItem(DRAFT_QUERY_KEY, value);
}

export function readLastCouncilRef() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(LAST_COUNCIL_REF_KEY);
}

export function writeLastCouncilRef(value: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!value) {
    window.localStorage.removeItem(LAST_COUNCIL_REF_KEY);
    return;
  }
  window.localStorage.setItem(LAST_COUNCIL_REF_KEY, value);
}
