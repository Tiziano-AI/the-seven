import { expect, type Page, test } from "@playwright/test";
import { installApiMocks } from "./browser-flow-fixtures";
import {
  fulfillDemoLogoutSuccess,
  fulfillSuccess,
  parseRouteBody,
  parseRouteIngress,
  parseRouteQuery,
} from "./browser-flow-http";

type BodyProbe = Readonly<{
  body?: string;
  contentType?: string;
}>;

type BodyProbeResult = Readonly<{
  status: number;
  text: string;
}>;

async function installNoBodyProbe(page: Page) {
  await page.route("**/body-parity**", async (route) => {
    if (!(await parseRouteIngress(route, "demo.logout"))) {
      return;
    }
    if ((await parseRouteQuery(route, "demo.logout")) === null) {
      return;
    }
    const body = await parseRouteBody(route, "demo.logout");
    if (body === null) {
      return;
    }
    await fulfillSuccess(route, "demo.logout", { success: true });
  });
  await page.goto("/");
}

async function installRequiredBodyProbe(page: Page) {
  await page.route("**/required-body-parity**", async (route) => {
    if (!(await parseRouteIngress(route, "demo.request"))) {
      return;
    }
    if ((await parseRouteQuery(route, "demo.request")) === null) {
      return;
    }
    const body = await parseRouteBody(route, "demo.request");
    if (body === null) {
      return;
    }
    await fulfillSuccess(route, "demo.request", { email: body.email });
  });
  await page.goto("/");
}

async function requestNoBodyProbe(page: Page, input: BodyProbe): Promise<BodyProbeResult> {
  return page.evaluate(async (probe) => {
    const headers =
      typeof probe.contentType === "string" ? { "content-type": probe.contentType } : undefined;
    const response = await fetch("/body-parity", {
      method: "POST",
      headers,
      body: probe.body,
    });
    return {
      status: response.status,
      text: await response.text(),
    };
  }, input);
}

async function requestRequiredBodyProbe(page: Page, input: BodyProbe): Promise<BodyProbeResult> {
  return page.evaluate(async (probe) => {
    const headers =
      typeof probe.contentType === "string" ? { "content-type": probe.contentType } : undefined;
    const response = await fetch("/required-body-parity", {
      method: "POST",
      headers,
      body: probe.body,
    });
    return {
      status: response.status,
      text: await response.text(),
    };
  }, input);
}

test("browser fixture no-body parser accepts an empty request body", async ({ page }) => {
  await installNoBodyProbe(page);

  const response = await requestNoBodyProbe(page, {});

  expect(response.status).toBe(200);
});

test("browser fixture no-body parser rejects an explicit empty JSON object", async ({ page }) => {
  await installNoBodyProbe(page);

  const response = await requestNoBodyProbe(page, {
    body: "{}",
    contentType: "application/json",
  });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: {
      reason: "invalid_request",
      issues: [{ path: "", message: "Request body must be empty" }],
    },
  });
});

test("browser fixture no-body parser rejects whitespace-only request bodies", async ({ page }) => {
  await installNoBodyProbe(page);

  const response = await requestNoBodyProbe(page, { body: "   " });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: {
      reason: "invalid_request",
      issues: [{ path: "", message: "Request body must be empty" }],
    },
  });
});

test("browser fixture no-body parser rejects non-empty JSON bodies", async ({ page }) => {
  await installNoBodyProbe(page);

  const response = await requestNoBodyProbe(page, {
    body: '{"unexpected":true}',
    contentType: "application/json",
  });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: {
      reason: "invalid_request",
      issues: [{ path: "", message: "Request body must be empty" }],
    },
  });
});

test("browser fixture no-body parser rejects non-empty bodies without JSON content type", async ({
  page,
}) => {
  await installNoBodyProbe(page);

  const response = await requestNoBodyProbe(page, {
    body: '{"unexpected":true}',
  });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: {
      reason: "invalid_request",
      issues: [{ path: "", message: "Request body must be empty" }],
    },
  });
});

test("browser fixture route parser rejects invalid ingress before fixture success", async ({
  page,
}) => {
  await installNoBodyProbe(page);

  const response = await page.evaluate(async () => {
    const result = await fetch("/body-parity", {
      method: "POST",
      headers: { "x-seven-ingress": "carrier-pigeon" },
    });
    return {
      status: result.status,
      text: await result.text(),
    };
  });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: {
      reason: "invalid_ingress",
      issues: [
        {
          path: "headers.x-seven-ingress",
          message: "Ingress source must be web, cli, or api",
        },
      ],
    },
  });
});

test("browser fixture route parser rejects undeclared query before fixture success", async ({
  page,
}) => {
  await installNoBodyProbe(page);

  const response = await page.evaluate(async () => {
    const result = await fetch("/body-parity?unexpected=1", { method: "POST" });
    return {
      status: result.status,
      text: await result.text(),
    };
  });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: {
      reason: "invalid_request",
      issues: [{ path: "query.", message: expect.any(String) }],
    },
  });
});

test("browser fixture parses body before handler-owned missing-auth denial", async ({ page }) => {
  const state = installApiMocks(page);
  await page.goto("/");

  const response = await page.evaluate(async () => {
    const result = await fetch("/api/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return {
      status: result.status,
      text: await result.text(),
    };
  });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: { reason: "invalid_request" },
  });
  expect(state.createSessionBodies).toEqual([]);
});

test("browser fixture same-origin gate precedes demo-cookie mutation auth denial", async ({
  page,
}) => {
  const rawBaseUrl = process.env.SEVEN_BASE_URL?.trim();
  if (!rawBaseUrl) {
    throw new Error("SEVEN_BASE_URL is required for browser fixture same-origin proof.");
  }
  const baseUrl = new URL(rawBaseUrl);
  await page.route("https://cross-origin-fixture.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>cross origin fixture</title>",
    });
  });
  await page.route("**/api/v1/demo/logout", async (route) => {
    await fulfillDemoLogoutSuccess(route);
  });

  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/demo/logout"),
  );
  await page.goto("https://cross-origin-fixture.test/");
  await page.evaluate(async (origin) => {
    await fetch(`${origin}/api/v1/demo/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
  }, baseUrl.origin);
  const response = await responsePromise;

  expect(response.status()).toBe(403);
});

test("browser fixture required-body parser rejects whitespace JSON as invalid JSON", async ({
  page,
}) => {
  await installRequiredBodyProbe(page);

  const response = await requestRequiredBodyProbe(page, {
    body: "   ",
    contentType: "application/json",
  });
  const body: unknown = JSON.parse(response.text);

  expect(response.status).toBe(400);
  expect(body).toMatchObject({
    kind: "invalid_input",
    details: {
      reason: "invalid_json",
      issues: [{ path: "", message: "Request body must be valid JSON" }],
    },
  });
});
