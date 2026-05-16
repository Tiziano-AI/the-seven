import { sessionSummary } from "./browser-flow-session-fixtures";

export type BrowserFlowApiMockState = Readonly<{
  userCouncilExists: boolean;
  createSessionBodies: unknown[];
  duplicateBodies: unknown[];
  saveBodies: unknown[];
  deleteCount: number;
  exportBodies: unknown[];
  continueSessionIds: number[];
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
      sessionSummary({ id: 101, query: "Recover interrupted chancery petition", status: "failed" }),
    ],
    [
      102,
      sessionSummary({ id: 102, query: "Completed petition on guild tolls", status: "completed" }),
    ],
    [104, sessionSummary({ id: 104, query: "Filed abbey archive question", status: "pending" })],
    [
      105,
      sessionSummary({ id: 105, query: "Awaiting first scholia docket", status: "processing" }),
    ],
    [106, sessionSummary({ id: 106, query: "Single-review manor dispute", status: "processing" })],
    [
      107,
      sessionSummary({ id: 107, query: "Split testimony on harbor dues", status: "completed" }),
    ],
    [108, sessionSummary({ id: 108, query: "Two-review charter split", status: "processing" })],
    [109, sessionSummary({ id: 109, query: "Sealed denied manuscript", status: "completed" })],
    [
      110,
      sessionSummary({
        id: 110,
        query: "CLI-filed borough petition",
        status: "pending",
        ingressSource: "cli",
      }),
    ],
    [
      111,
      sessionSummary({
        id: 111,
        query: "API-filed abbey petition",
        status: "pending",
        ingressSource: "api",
      }),
    ],
    [
      112,
      sessionSummary({
        id: 112,
        query: "Partial-cost abbey verdict",
        status: "completed",
        totalCostUsdMicros: 123,
        totalCostIsPartial: true,
      }),
    ],
  ]);
}
