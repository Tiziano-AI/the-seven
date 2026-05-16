import type { Route } from "@playwright/test";
import type { RouteContractId } from "@the-seven/contracts";
import { parseRouteBody, parseRouteIngress, parseRouteQuery } from "./browser-flow-http";

/** Parses one static no-body browser fixture request through the registry-owned route input. */
export async function parseStaticNoBodyRoute<const Id extends RouteContractId>(
  route: Route,
  routeId: Id,
) {
  if (!(await parseRouteIngress(route, routeId))) {
    return false;
  }
  if ((await parseRouteQuery(route, routeId)) === null) {
    return false;
  }
  return (await parseRouteBody(route, routeId)) !== null;
}

/** Parses one static JSON-body browser fixture request through the registry-owned route input. */
export async function parseStaticBodyRoute<const Id extends RouteContractId>(
  route: Route,
  routeId: Id,
) {
  if (!(await parseRouteIngress(route, routeId))) {
    return null;
  }
  if ((await parseRouteQuery(route, routeId)) === null) {
    return null;
  }
  return await parseRouteBody(route, routeId);
}

/** Returns whether a submitted fixture body targets the Commons built-in council. */
export function bodyUsesCommonsCouncil(body: unknown) {
  if (typeof body !== "object" || body === null || !("councilRef" in body)) {
    return false;
  }
  const councilRef = body.councilRef;
  return (
    typeof councilRef === "object" &&
    councilRef !== null &&
    "kind" in councilRef &&
    councilRef.kind === "built_in" &&
    "slug" in councilRef &&
    councilRef.slug === "commons"
  );
}
