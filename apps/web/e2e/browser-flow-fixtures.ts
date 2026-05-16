import type { Page } from "@playwright/test";
import { parseStaticNoBodyRoute } from "./browser-flow-api-common";
import { handleCouncilApiMockRoute } from "./browser-flow-api-council-routes";
import { handleSessionApiMockRoute } from "./browser-flow-api-session-routes";
import {
  createBrowserFlowApiMockState,
  createBrowserFlowSessionMap,
} from "./browser-flow-api-state";
import { admitDemoCookieRead } from "./browser-flow-http";

export { builtInCommonsRef } from "./browser-flow-council-fixtures";
export { phasePrompts } from "./browser-flow-session-fixtures";

/** Installs the contract-faithful `/api/v1` browser fixtures used by UI acceptance flows. */
export function installApiMocks(page: Page) {
  const state = createBrowserFlowApiMockState();
  const sessions = createBrowserFlowSessionMap();

  page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === "/api/v1/demo/session" && method === "GET") {
      if (!(await parseStaticNoBodyRoute(route, "demo.session"))) {
        return;
      }
      await admitDemoCookieRead(route, "demo.session");
      return;
    }
    if (pathname.startsWith("/api/v1/demo/")) {
      await route.fallback();
      return;
    }

    if (await handleCouncilApiMockRoute({ route, request, pathname, method, state })) {
      return;
    }
    if (await handleSessionApiMockRoute({ route, request, pathname, method, state, sessions })) {
      return;
    }

    throw new Error(`Unhandled ${method} ${pathname}`);
  });

  return state;
}
