import { expect, test } from "@playwright/test";
import { unlockByok } from "./browser-flow-auth";
import { installDemoSessionMock } from "./browser-flow-demo-session";
import { builtInCommonsRef, installApiMocks } from "./browser-flow-fixtures";
import {
  demoCookieName,
  fulfillDemoLogoutSuccess,
  fulfillSuccess,
  fulfillUnauthorized,
  parseRouteBody,
  parseRouteIngress,
  parseRouteQuery,
  proofByokAuthorization,
  proofByokKey,
  proofDemoSessionToken,
} from "./browser-flow-http";

function requireSevenBaseUrl(context: string): URL {
  const raw = process.env.SEVEN_BASE_URL?.trim();
  if (!raw) {
    throw new Error(`SEVEN_BASE_URL is required for ${context}.`);
  }
  return new URL(raw);
}

test("demo magic-link request leaves a durable receipt", async ({ page }) => {
  const requests: unknown[] = [];
  let demoRequestReleased = false;
  const releaseDemoRequestWaiters: Array<() => void> = [];
  await page.route("**/api/v1/demo/session", async (route) => {
    if (!(await parseRouteIngress(route, "demo.session"))) {
      return;
    }
    if ((await parseRouteQuery(route, "demo.session")) === null) {
      return;
    }
    if ((await parseRouteBody(route, "demo.session")) === null) {
      return;
    }
    await fulfillUnauthorized(route, "demo.session");
  });
  await page.route("**/api/v1/demo/request", async (route) => {
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
    requests.push(body);
    if (!demoRequestReleased) {
      await new Promise<void>((resolve) => {
        releaseDemoRequestWaiters.push(resolve);
      });
    }
    await fulfillSuccess(route, "demo.request", { email: "reader@example.com" });
  });

  await page.goto("/");
  await page.getByLabel("Email for a 24-hour demo").fill("reader@example.com");
  await page.getByRole("button", { name: "Send magic link" }).dblclick();
  await expect(page.getByRole("button", { name: "Sending magic link…" })).toBeDisabled();
  await expect.poll(() => releaseDemoRequestWaiters.length).toBe(1);
  demoRequestReleased = true;
  for (const releaseDemoRequest of releaseDemoRequestWaiters) {
    releaseDemoRequest();
  }

  await expect.poll(() => requests).toEqual([{ email: "reader@example.com" }]);
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "reader@example.com" })).toBeVisible();
  await expect(
    page.getByText("opens a 24-hour Commons demo in the browser where you open the email link"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend magic link" })).toBeVisible();
});

test("locked gate blocks invalid demo email and prioritizes stored key unlock", async ({
  page,
}) => {
  installApiMocks(page);

  await page.goto("/");
  await expect(page.locator("#demo-email")).toHaveAttribute("autocomplete", "email");
  await page.getByLabel("Email for a 24-hour demo").fill("not-an-email");
  await expect(page.getByRole("button", { name: "Send magic link" })).toBeDisabled();
  await page.getByRole("button", { name: /Use your OpenRouter key/u }).click();
  await expect(page.getByLabel("OpenRouter API key")).toBeFocused();
  await expect(page.locator("#byok-api-key")).toHaveAttribute("autocomplete", "off");
  await expect(page.locator("#byok-password")).toHaveAttribute("autocomplete", "new-password");
  await expect(page.getByText("Technical details")).toBeVisible();
  await expect(
    page.getByText("The server can read the key only while handling the request."),
  ).not.toBeVisible();
  await page.getByText("Technical details").click();
  await expect(
    page.getByText("The server can read the key only while handling the request."),
  ).toBeVisible();
  await page.getByLabel("OpenRouter API key").fill("sk-or-invalid-browser-proof");
  await page.getByLabel("Local Password").fill("browser-proof-password");
  await expect(page.getByRole("button", { name: "Save and unlock key" })).toBeEnabled();
  await page.getByRole("button", { name: "Save and unlock key" }).click();
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();

  await unlockByok(page);
  await page.getByRole("button", { name: "Lock key" }).click();
  await expect(page.getByText("Lock OpenRouter key?")).toBeVisible();
  await page.locator(".confirm-panel").getByRole("button", { name: "Lock key" }).click();
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
  await expect(page.locator(".gate input").first()).toHaveAttribute("id", "unlock-password");
  await expect(page.locator("#unlock-password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
});

test("visible demo session self-expires at the server-issued expiry", async ({ context, page }) => {
  const origin = requireSevenBaseUrl("visible demo session cookie proof");
  await context.addCookies([
    {
      name: demoCookieName,
      value: "expiring-demo-session",
      domain: origin.hostname,
      path: "/",
      expires: Math.floor((Date.now() + 60_000) / 1000),
      httpOnly: true,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/v1/demo/session", async (route) => {
    if (!(await parseRouteIngress(route, "demo.session"))) {
      return;
    }
    if ((await parseRouteQuery(route, "demo.session")) === null) {
      return;
    }
    if ((await parseRouteBody(route, "demo.session")) === null) {
      return;
    }
    await fulfillSuccess(route, "demo.session", {
      email: "reader@example.com",
      expiresAt: Date.now() + 500,
    });
  });

  await page.goto("/");
  await expect(page.getByText(/Demo active · expires/)).toBeVisible();
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible({
    timeout: 5000,
  });
});

test("demo-to-key confirmation ends the server demo before unlock", async ({ context, page }) => {
  let logoutCount = 0;
  installApiMocks(page);
  await installDemoSessionMock(context, page);
  await page.route("**/api/v1/demo/logout", async (route) => {
    if (await fulfillDemoLogoutSuccess(route)) {
      logoutCount += 1;
    }
  });

  await page.goto("/");
  await expect(page.getByText(/Demo active · expires/)).toBeVisible();
  await page.getByRole("button", { name: "End demo and use your key" }).click();
  await expect(page.getByText("End demo session and use your key?")).toBeVisible();
  await page.getByRole("button", { name: "Keep demo" }).click();

  await page.goto("/councils");
  await expect(page.getByText(/Demo mode is locked to the Commons Council/)).toBeVisible();
  await page.getByRole("button", { name: "End demo and use your key" }).click();
  await expect(page.getByText("End demo session and use your key?")).toBeVisible();
  await expect(
    page.getByText(/Your OpenRouter key can be used after the demo session closes/),
  ).toBeVisible();
  const logoutResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/demo/logout"),
  );
  await page
    .locator(".confirm-panel")
    .getByRole("button", { name: "End demo and use your key" })
    .click();
  await expect.poll(() => logoutCount).toBe(1);
  await logoutResponse;
  await expect(page).toHaveURL(/\/\?unlock=byok$/u);
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
  await expect(page.getByLabel("OpenRouter API key")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("seven.last_council_ref")))
    .toBe("built_in:founding");
  await page.getByLabel("OpenRouter API key").fill(proofByokKey);
  await page.getByLabel("Local Password").fill("browser-proof-password");
  await page.getByRole("button", { name: "Save and unlock key" }).click();
  await expect(page.getByText("OpenRouter key unlocked", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "The Founding Council" })).toBeChecked();
  await expect(
    page.getByText("Strongest built-in council. GPT-5.5 Pro writes the final answer."),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const cookies = await context.cookies();
      return cookies.some((cookie) => cookie.name === demoCookieName);
    })
    .toBe(false);

  const origin = requireSevenBaseUrl("stale demo cookie proof");
  await context.addCookies([
    {
      name: demoCookieName,
      value: `stale-${proofDemoSessionToken}`,
      domain: origin.hostname,
      path: "/",
      expires: Math.floor((Date.now() + 86_400_000) / 1000),
      httpOnly: true,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const response = await fetch("/api/v1/demo/session");
        const body = (await response.json()) as { details?: { reason?: string } };
        return { status: response.status, reason: body.details?.reason ?? null };
      }),
    )
    .toEqual({ status: 401, reason: "invalid_token" });
});

test("fixture authority denials leave browser proof state unchanged", async ({ context, page }) => {
  const state = installApiMocks(page);
  await installDemoSessionMock(context, page);
  await page.goto("/");

  const duplicateStatus = await page.evaluate(async () => {
    const response = await fetch("/api/v1/councils/duplicate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: { kind: "built_in", slug: "commons" },
        name: "Should Not Mutate",
      }),
    });
    return response.status;
  });
  expect(duplicateStatus).toBe(403);
  expect(state.duplicateBodies).toEqual([]);

  const createStatus = await page.evaluate(async () => {
    const response = await fetch("/api/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "Denied demo founding question",
        councilRef: { kind: "built_in", slug: "founding" },
      }),
    });
    return response.status;
  });
  expect(createStatus).toBe(403);
  expect(state.createSessionBodies).toEqual([]);
});

test("fixture auth mapper gives key precedence and denies invalid Authorization before demo fallback", async ({
  context,
  page,
}) => {
  const state = installApiMocks(page);
  await installDemoSessionMock(context, page);
  await page.goto("/");

  const byokStatus = await page.evaluate(async (authorization) => {
    const response = await fetch("/api/v1/sessions", {
      headers: { authorization },
    });
    return response.status;
  }, proofByokAuthorization);
  expect(byokStatus).toBe(200);
  expect(state.createSessionBodies).toEqual([]);

  const invalidStatus = await page.evaluate(async () => {
    const response = await fetch("/api/v1/sessions", {
      headers: { authorization: "Bearer sk-or-stale" },
    });
    const body = (await response.json()) as { details?: { reason?: string } };
    return { status: response.status, reason: body.details?.reason ?? null };
  });
  expect(invalidStatus).toEqual({ status: 401, reason: "invalid_token" });
  expect(state.createSessionBodies).toEqual([]);
});

test("OpenRouter key unlock, attachment submit, and lock are browser-proven", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page, { submitTwice: true });
  await expect.poll(() => state.authValidateBodies.length).toBe(1);

  await page.getByRole("radio", { name: /The Commons Council/ }).check();
  await expect(
    page.getByText("Low-cost demo council. MiniMax M2.7 writes the final answer."),
  ).toBeVisible();
  await expect(page.getByText(/Up to 5 exhibits/)).toBeVisible();
  await page.getByLabel("Question").fill("Question with evidence");
  await page.getByLabel("Question").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "The Commons Council" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Manage councils" })).toBeFocused();
  await page.keyboard.press("Tab");
  const exhibitTrigger = page.getByRole("button", { name: "Choose or drop files" });
  await expect(exhibitTrigger).toBeFocused();
  await expect(page.locator("#matter-attachments")).not.toBeFocused();
  await page.setInputFiles("#matter-attachments", [
    {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("attached notes"),
    },
    {
      name: "brief.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# brief"),
    },
  ]);
  const selectedEvidence = page.getByRole("list", { name: "Selected evidence" });
  await expect(selectedEvidence.getByText("File 1: notes.txt")).toBeVisible();
  await expect(selectedEvidence.getByText("File 2: brief.md")).toBeVisible();
  await page.getByRole("button", { name: "Remove notes.txt" }).click();
  await expect(page.getByRole("button", { name: "Remove notes.txt" })).toBeHidden();
  await expect(selectedEvidence.getByText("File 1: brief.md")).toBeVisible();
  await page.getByRole("button", { name: "Clear files" }).click();
  await expect(page.getByRole("list", { name: "Selected evidence" })).toBeHidden();
  await page.setInputFiles("#matter-attachments", {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("attached notes"),
  });
  await expect(
    page.getByRole("list", { name: "Selected evidence" }).getByText("File 1: notes.txt"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ask the council" }).dblclick();
  await expect.poll(() => state.createSessionBodies.length).toBe(1);
  expect(state.createSessionBodies[0]).toEqual({
    query: "Question with evidence",
    councilRef: builtInCommonsRef(),
    attachments: [{ name: "notes.txt", base64: "YXR0YWNoZWQgbm90ZXM=" }],
  });
  await expect(page.getByText("1 exhibit", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready for another question")).toBeVisible();
  await expect(page.locator(".docket-question").getByText("Question with evidence")).toBeVisible();
  await expect(page.getByLabel("Question")).toHaveValue("");

  await page.getByRole("button", { name: "Lock key" }).click();
  await expect(page.getByText("Lock OpenRouter key?")).toBeVisible();
  await page.locator(".confirm-panel").getByRole("button", { name: "Lock key" }).click();
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock stored key" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("seven.encrypted_api_key")))
    .not.toBeNull();
  const storedUnlockListCount = state.councilListUsesByok.length;
  const storedUnlockValidateCount = state.authValidateBodies.length;
  await page.getByLabel("Unlock Password").fill("browser-proof-password");
  await expect(page.getByRole("button", { name: "Unlock stored key" })).toBeEnabled();
  await page.getByRole("button", { name: "Unlock stored key" }).dblclick();
  await expect.poll(() => state.authValidateBodies.length).toBe(storedUnlockValidateCount + 1);
  expect(state.authValidateBodies.slice(storedUnlockValidateCount)).toEqual([{}]);
  await expect(page.getByText("OpenRouter key unlocked", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Manage councils" }).click();
  await expect(page.getByRole("heading", { name: "Manage councils" })).toBeVisible();
  await expect
    .poll(() => state.councilListUsesByok.slice(storedUnlockListCount).includes(true))
    .toBe(true);
  await page.getByRole("button", { name: /The Commons Council/ }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect.poll(() => state.duplicateBodies.length).toBe(1);
  expect(state.duplicateBodies[0]).toEqual({
    source: builtInCommonsRef(),
    name: "The Commons Council Copy",
  });
  await page.getByRole("link", { name: "Back to Ask" }).click();
  await page.getByRole("button", { name: "Lock key" }).click();
  await expect(page.getByText("Lock OpenRouter key?")).toBeVisible();
  await page.locator(".confirm-panel").getByRole("button", { name: "Lock key" }).click();
  await expect(page.getByText("Ask once. Get one answer you can inspect.")).toBeVisible();
  await page.getByRole("button", { name: "Use a different key" }).click();
  await expect(page.getByText("Remove this browser's stored key?")).toBeVisible();
  await page.getByRole("button", { name: "Keep stored key" }).click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("seven.encrypted_api_key")))
    .not.toBeNull();
  await page.getByRole("button", { name: "Use a different key" }).click();
  await page.getByRole("button", { name: "Remove local encrypted key" }).click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("seven.encrypted_api_key")))
    .toBeNull();
});
