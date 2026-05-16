import type { Route } from "@playwright/test";
import { routeContract } from "@the-seven/contracts";
import { parseStaticBodyRoute, parseStaticNoBodyRoute } from "./browser-flow-api-common";
import type { MutableBrowserFlowApiMockState } from "./browser-flow-api-state";
import {
  builtInCouncilByLocator,
  builtInCouncilListFixtures,
  councilListItem,
  encodeCouncilRef,
  userCouncilRef,
} from "./browser-flow-council-fixtures";
import {
  admitResolvedAnyAuthority,
  admitResolvedByok,
  fulfillDemoCouncilOnly,
  fulfillNotFound,
  fulfillSuccess,
  parseRouteBody,
  parseRouteIngress,
  parseRouteParams,
  parseRouteQuery,
  requestAuthority,
} from "./browser-flow-http";
import {
  modelAutocompletePayload,
  modelValidationPayload,
  proofModelForPosition,
} from "./browser-flow-model-fixtures";
import { councilDetail, outputFormats } from "./browser-flow-session-fixtures";

type BrowserFlowRouteInput = Readonly<{
  route: Route;
  request: ReturnType<Route["request"]>;
  pathname: string;
  method: string;
  state: MutableBrowserFlowApiMockState;
}>;

/** Handles auth, model, and council registry rows for browser-flow API fixtures. */
export async function handleCouncilApiMockRoute(input: BrowserFlowRouteInput): Promise<boolean> {
  const { route, request, pathname, method, state } = input;

  if (pathname === "/api/v1/auth/validate" && method === "POST") {
    const authority = requestAuthority(request, "any");
    if (!(await parseStaticNoBodyRoute(route, "auth.validate"))) {
      return true;
    }
    if (!(await admitResolvedByok(route, "auth.validate", authority))) {
      return true;
    }
    state.authValidateBodies.push({});
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fulfillSuccess(route, "auth.validate", { valid: true });
    return true;
  }

  if (pathname === "/api/v1/models/validate" && method === "POST") {
    const authority = requestAuthority(request, "any");
    const body = await parseStaticBodyRoute(route, "models.validate");
    if (body === null) {
      return true;
    }
    if (!(await admitResolvedByok(route, "models.validate", authority))) {
      return true;
    }
    const modelId = body.modelId ?? proofModelForPosition(1).id;
    await fulfillSuccess(route, "models.validate", modelValidationPayload(modelId));
    return true;
  }

  if (pathname === "/api/v1/models/autocomplete" && method === "POST") {
    const authority = requestAuthority(request, "any");
    const body = await parseStaticBodyRoute(route, "models.autocomplete");
    if (body === null) {
      return true;
    }
    if (!(await admitResolvedByok(route, "models.autocomplete", authority))) {
      return true;
    }
    await fulfillSuccess(route, "models.autocomplete", modelAutocompletePayload());
    return true;
  }

  if (pathname === "/api/v1/councils" && method === "GET") {
    const authority = requestAuthority(request, "any");
    if (!(await parseStaticNoBodyRoute(route, "councils.list"))) {
      return true;
    }
    const admittedAuthority = await admitResolvedAnyAuthority(route, "councils.list", authority);
    if (!admittedAuthority) {
      return true;
    }
    const usesByok = admittedAuthority === "byok";
    state.councilListUsesByok.push(usesByok);
    const builtIns = builtInCouncilListFixtures({ includeAllBuiltIns: usesByok });
    const councils = builtIns.map((council) => councilListItem(council.ref, council.name, false));
    if (usesByok && state.userCouncilExists) {
      councils.push(councilListItem(userCouncilRef(), "Commons Copy", true));
    }
    await fulfillSuccess(route, "councils.list", { councils });
    return true;
  }

  if (pathname === "/api/v1/councils/output-formats" && method === "GET") {
    const authority = requestAuthority(request, "any");
    if (!(await parseStaticNoBodyRoute(route, "councils.outputFormats"))) {
      return true;
    }
    if (!(await admitResolvedAnyAuthority(route, "councils.outputFormats", authority))) {
      return true;
    }
    const payload = routeContract("councils.outputFormats").successPayloadSchema.parse({
      outputFormats: outputFormats(),
    });
    await fulfillSuccess(route, "councils.outputFormats", {
      outputFormats: payload.outputFormats,
    });
    return true;
  }

  if (pathname === "/api/v1/councils/duplicate" && method === "POST") {
    const authority = requestAuthority(request, "any");
    const body = await parseStaticBodyRoute(route, "councils.duplicate");
    if (body === null) {
      return true;
    }
    if (!(await admitResolvedByok(route, "councils.duplicate", authority))) {
      return true;
    }
    state.duplicateBodies.push(body);
    state.userCouncilExists = true;
    await fulfillSuccess(route, "councils.duplicate", { councilId: 901 });
    return true;
  }

  if (!pathname.startsWith("/api/v1/councils/")) {
    return false;
  }

  const rawLocator = decodeURIComponent(pathname.replace("/api/v1/councils/", ""));
  if (method === "GET") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "councils.get"))) {
      return true;
    }
    const params = await parseRouteParams(route, "councils.get", { locator: rawLocator });
    if (params === null) {
      return true;
    }
    if ((await parseRouteQuery(route, "councils.get")) === null) {
      return true;
    }
    if ((await parseRouteBody(route, "councils.get")) === null) {
      return true;
    }
    const admittedAuthority = await admitResolvedAnyAuthority(route, "councils.get", authority);
    if (!admittedAuthority) {
      return true;
    }
    const locator = encodeCouncilRef(params.locator);
    const isUserCouncil = locator === encodeCouncilRef(userCouncilRef());
    const builtInCouncil = builtInCouncilByLocator(locator);
    if (!isUserCouncil && !builtInCouncil) {
      await fulfillNotFound(route, "councils.get", "council");
      return true;
    }
    if (admittedAuthority === "demo" && (isUserCouncil || builtInCouncil.ref.slug !== "commons")) {
      await fulfillDemoCouncilOnly(route, "councils.get");
      return true;
    }
    const payload = routeContract("councils.get").successPayloadSchema.parse(
      isUserCouncil
        ? councilDetail(userCouncilRef(), "Commons Copy", true)
        : councilDetail(builtInCouncil.ref, builtInCouncil.name, false),
    );
    await fulfillSuccess(route, "councils.get", payload);
    return true;
  }

  if (method === "PUT") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "councils.update"))) {
      return true;
    }
    if ((await parseRouteParams(route, "councils.update", { locator: rawLocator })) === null) {
      return true;
    }
    if ((await parseRouteQuery(route, "councils.update")) === null) {
      return true;
    }
    const body = await parseRouteBody(route, "councils.update");
    if (body === null) {
      return true;
    }
    if (!(await admitResolvedByok(route, "councils.update", authority))) {
      return true;
    }
    state.saveBodies.push(body);
    await fulfillSuccess(route, "councils.update", { success: true });
    return true;
  }

  if (method === "DELETE") {
    const authority = requestAuthority(request, "any");
    if (!(await parseRouteIngress(route, "councils.delete"))) {
      return true;
    }
    if ((await parseRouteParams(route, "councils.delete", { locator: rawLocator })) === null) {
      return true;
    }
    if ((await parseRouteQuery(route, "councils.delete")) === null) {
      return true;
    }
    if ((await parseRouteBody(route, "councils.delete")) === null) {
      return true;
    }
    if (!(await admitResolvedByok(route, "councils.delete", authority))) {
      return true;
    }
    state.deleteCount += 1;
    state.userCouncilExists = false;
    await fulfillSuccess(route, "councils.delete", { success: true });
    return true;
  }

  return false;
}
