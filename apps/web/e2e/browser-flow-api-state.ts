import { sessionSummary } from "./browser-flow-session-fixtures";

export type BrowserFlowApiMockState = Readonly<{
  userCouncilExists: boolean;
  createSessionBodies: unknown[];
  duplicateBodies: unknown[];
  saveBodies: unknown[];
  deleteCount: number;
  exportBodies: unknown[];
  continueSessionIds: number[];
  rerunSessionIds: number[];
  rerunBodies: unknown[];
  councilListUsesByok: boolean[];
  authValidateBodies: unknown[];
}>;

export type MutableBrowserFlowApiMockState = {
  -readonly [Key in keyof BrowserFlowApiMockState]: BrowserFlowApiMockState[Key];
};

export type BrowserFlowSessionMap = Map<number, ReturnType<typeof sessionSummary>>;

/** Creates the mutable state ledger used by browser-flow API fixtures. */
export function createBrowserFlowApiMockState(): MutableBrowserFlowApiMockState {
  return {
    userCouncilExists: false,
    createSessionBodies: [],
    duplicateBodies: [],
    saveBodies: [],
    deleteCount: 0,
    exportBodies: [],
    continueSessionIds: [],
    rerunSessionIds: [],
    rerunBodies: [],
    councilListUsesByok: [],
    authValidateBodies: [],
  };
}

/** Creates the session ledger served by browser-flow API fixtures. */
export function createBrowserFlowSessionMap(): BrowserFlowSessionMap {
  return new Map<number, ReturnType<typeof sessionSummary>>([
    [
      101,
      sessionSummary({ id: 101, query: "Recover interrupted pricing question", status: "failed" }),
    ],
    [
      102,
      sessionSummary({
        id: 102,
        query: "Completed vendor selection question",
        status: "completed",
      }),
    ],
    [104, sessionSummary({ id: 104, query: "Filed roadmap planning question", status: "pending" })],
    [
      105,
      sessionSummary({ id: 105, query: "Working answer before reviews", status: "processing" }),
    ],
    [106, sessionSummary({ id: 106, query: "Single-review vendor dispute", status: "processing" })],
    [107, sessionSummary({ id: 107, query: "Split evidence on launch risk", status: "completed" })],
    [108, sessionSummary({ id: 108, query: "Two-review launch split", status: "processing" })],
    [109, sessionSummary({ id: 109, query: "Denied saved run", status: "completed" })],
    [
      110,
      sessionSummary({
        id: 110,
        query: "CLI-filed operations question",
        status: "pending",
        ingressSource: "cli",
      }),
    ],
    [
      111,
      sessionSummary({
        id: 111,
        query: "API-filed product question",
        status: "pending",
        ingressSource: "api",
      }),
    ],
    [
      112,
      sessionSummary({
        id: 112,
        query: "Partial-cost answer",
        status: "completed",
        totalCostUsdMicros: 123,
        totalCostIsPartial: true,
      }),
    ],
    [
      113,
      sessionSummary({
        id: 113,
        query: "Custom council vendor question",
        status: "completed",
        councilName: "Commons Copy",
      }),
    ],
  ]);
}
