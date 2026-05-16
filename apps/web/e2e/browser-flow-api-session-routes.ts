import type { Route } from "@playwright/test";
import { bodyUsesCommonsCouncil, parseStaticNoBodyRoute } from "./browser-flow-api-common";
import type {
  BrowserFlowSessionMap,
  MutableBrowserFlowApiMockState,
} from "./browser-flow-api-state";
import {
  admitResolvedAnyAuthority,
  fulfillDemoCouncilOnly,
  fulfillNotFound,
  fulfillSuccess,
  parseRouteBody,
  parseRouteIngress,
  parseRouteParams,
  parseRouteQuery,
  requestAuthority,
  requireResolvedDemoMutationSameOrigin,
} from "./browser-flow-http";
import {
  providerPhaseOneSuccessCallFor,
  providerPhaseTwoSuccessCallFor,
  providerPreEgressDenialCallFor,
  providerUpstreamErrorCallFor,
} from "./browser-flow-provider-calls";
import { sessionDetail, sessionSnapshot, sessionSummary } from "./browser-flow-session-fixtures";

type BrowserFlowSessionRouteInput = Readonly<{
  route: Route;
  request: ReturnType<Route["request"]>;
  pathname: string;
  method: string;
  state: MutableBrowserFlowApiMockState;
  sessions: BrowserFlowSessionMap;
}>;

/** Handles session registry rows for browser-flow API fixtures. */
export async function handleSessionApiMockRoute(
  input: BrowserFlowSessionRouteInput,
): Promise<boolean> {
  const { route, request, pathname, method, state, sessions } = input;

  if (pathname === "/api/v1/sessions" && method === "GET") {
    const authority = requestAuthority(request, "any");
    if (!(await parseStaticNoBodyRoute(route, "sessions.list"))) {
      return true;
    }
    if (!(await admitResolvedAnyAuthority(route, "sessions.list", authority))) {
      return true;
    }
    await fulfillSuccess(route, "sessions.list", [...sessions.values()]);
    return true;
  }

  if (pathname === "/api/v1/sessions" && method === "POST") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "sessions.create"))) {
      return true;
    }
    if (!(await requireResolvedDemoMutationSameOrigin(route, "sessions.create", authority))) {
      return true;
    }
    if ((await parseRouteQuery(route, "sessions.create")) === null) {
      return true;
    }
    const body = await parseRouteBody(route, "sessions.create");
    if (body === null) {
      return true;
    }
    const admittedAuthority = await admitResolvedAnyAuthority(route, "sessions.create", authority);
    if (!admittedAuthority) {
      return true;
    }
    if (admittedAuthority === "demo" && !bodyUsesCommonsCouncil(body)) {
      await fulfillDemoCouncilOnly(route, "sessions.create");
      return true;
    }
    state.createSessionBodies.push(body);
    await new Promise((resolve) => setTimeout(resolve, 100));
    sessions.set(
      77,
      sessionSummary({ id: 77, query: "Matter with evidence", status: "completed" }),
    );
    await fulfillSuccess(route, "sessions.create", { sessionId: 77 });
    return true;
  }

  if (pathname === "/api/v1/sessions/export" && method === "POST") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "sessions.export"))) {
      return true;
    }
    if (!(await requireResolvedDemoMutationSameOrigin(route, "sessions.export", authority))) {
      return true;
    }
    if ((await parseRouteQuery(route, "sessions.export")) === null) {
      return true;
    }
    const body = await parseRouteBody(route, "sessions.export");
    if (body === null) {
      return true;
    }
    if (!(await admitResolvedAnyAuthority(route, "sessions.export", authority))) {
      return true;
    }
    state.exportBodies.push(body);
    const title =
      body.sessionIds.length === 1
        ? `# Manuscript ${body.sessionIds[0]}`
        : `# Dossier ${body.sessionIds.join(", ")}`;
    await fulfillSuccess(route, "sessions.export", {
      markdown: title,
      json: '{"ok":true}',
    });
    return true;
  }

  const continueMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/continue$/);
  if (continueMatch && method === "POST") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "sessions.continue"))) {
      return true;
    }
    if (!(await requireResolvedDemoMutationSameOrigin(route, "sessions.continue", authority))) {
      return true;
    }
    const params = await parseRouteParams(route, "sessions.continue", {
      sessionId: continueMatch[1] ?? "",
    });
    if (params === null) {
      return true;
    }
    if ((await parseRouteQuery(route, "sessions.continue")) === null) {
      return true;
    }
    if ((await parseRouteBody(route, "sessions.continue")) === null) {
      return true;
    }
    const admittedAuthority = await admitResolvedAnyAuthority(
      route,
      "sessions.continue",
      authority,
    );
    if (!admittedAuthority) {
      return true;
    }
    const sessionId = params.sessionId;
    if (admittedAuthority === "demo") {
      const summary = sessions.get(sessionId);
      if (summary?.councilNameAtRun !== "The Commons Council") {
        await fulfillDemoCouncilOnly(route, "sessions.continue");
        return true;
      }
    }
    state.continueSessionIds.push(sessionId);
    sessions.set(
      sessionId,
      sessionSummary({
        id: sessionId,
        query: "Recover interrupted chancery petition",
        status: "processing",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await fulfillSuccess(route, "sessions.continue", { sessionId });
    return true;
  }

  const rerunMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/rerun$/);
  if (rerunMatch && method === "POST") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "sessions.rerun"))) {
      return true;
    }
    if (!(await requireResolvedDemoMutationSameOrigin(route, "sessions.rerun", authority))) {
      return true;
    }
    if (
      (await parseRouteParams(route, "sessions.rerun", {
        sessionId: rerunMatch[1] ?? "",
      })) === null
    ) {
      return true;
    }
    if ((await parseRouteQuery(route, "sessions.rerun")) === null) {
      return true;
    }
    const body = await parseRouteBody(route, "sessions.rerun");
    if (body === null) {
      return true;
    }
    const admittedAuthority = await admitResolvedAnyAuthority(route, "sessions.rerun", authority);
    if (!admittedAuthority) {
      return true;
    }
    if (admittedAuthority === "demo" && !bodyUsesCommonsCouncil(body)) {
      await fulfillDemoCouncilOnly(route, "sessions.rerun");
      return true;
    }
    state.rerunBodies.push(body);
    sessions.set(
      103,
      sessionSummary({
        id: 103,
        query: "Completed petition on guild tolls",
        status: "pending",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fulfillSuccess(route, "sessions.rerun", { sessionId: 103 });
    return true;
  }

  const sessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (sessionMatch && method === "GET") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "sessions.get"))) {
      return true;
    }
    const params = await parseRouteParams(route, "sessions.get", {
      sessionId: sessionMatch[1] ?? "",
    });
    if (params === null) {
      return true;
    }
    if ((await parseRouteQuery(route, "sessions.get")) === null) {
      return true;
    }
    if ((await parseRouteBody(route, "sessions.get")) === null) {
      return true;
    }
    if (!(await admitResolvedAnyAuthority(route, "sessions.get", authority))) {
      return true;
    }
    const sessionId = params.sessionId;
    const summary =
      sessions.get(sessionId) ??
      sessionSummary({ id: sessionId, query: "Matter with evidence", status: "completed" });
    const attachments = sessionId === 77 ? [{ name: "notes.txt", text: "attached notes" }] : [];
    if (sessionId === 109) {
      await fulfillNotFound(route, "sessions.get", "session");
      return true;
    }
    await fulfillSuccess(
      route,
      "sessions.get",
      sessionDetail({
        id: summary.id,
        query: summary.query,
        status: summary.status,
        councilName: summary.councilNameAtRun,
        attachments,
        ingressSource: summary.ingressSource,
      }),
    );
    return true;
  }

  const diagnosticsMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/diagnostics$/);
  if (diagnosticsMatch && method === "GET") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "sessions.diagnostics"))) {
      return true;
    }
    const params = await parseRouteParams(route, "sessions.diagnostics", {
      sessionId: diagnosticsMatch[1] ?? "",
    });
    if (params === null) {
      return true;
    }
    if ((await parseRouteQuery(route, "sessions.diagnostics")) === null) {
      return true;
    }
    if ((await parseRouteBody(route, "sessions.diagnostics")) === null) {
      return true;
    }
    if (!(await admitResolvedAnyAuthority(route, "sessions.diagnostics", authority))) {
      return true;
    }
    const sessionId = params.sessionId;
    const summary =
      sessions.get(sessionId) ??
      sessionSummary({
        id: sessionId,
        query: "Completed petition on guild tolls",
        status: "completed",
      });
    await fulfillSuccess(route, "sessions.diagnostics", {
      session: {
        ...summary,
        snapshot: sessionSnapshot({
          query: summary.query,
          councilName: summary.councilNameAtRun,
        }),
      },
      providerCalls: [
        providerPhaseOneSuccessCallFor({ sessionId, memberPosition: 1 }),
        providerPhaseTwoSuccessCallFor({ sessionId, memberPosition: 2 }),
        providerPreEgressDenialCallFor({ sessionId, memberPosition: 3 }),
        providerUpstreamErrorCallFor({ sessionId, memberPosition: 4 }),
      ],
      terminalError:
        summary.status === "failed"
          ? "OpenRouter request failed: upstream provider returned a rate-limit response."
          : null,
    });
    return true;
  }

  return false;
}
