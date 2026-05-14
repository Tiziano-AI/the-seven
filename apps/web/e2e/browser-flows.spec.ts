import { expect, type Page, type Route, test } from "@playwright/test";

const timestamp = "2026-05-12T10:00:00.000Z";

type CouncilRef =
  | Readonly<{ kind: "built_in"; slug: string }>
  | Readonly<{ kind: "user"; councilId: number }>;

type SessionStatus = "pending" | "processing" | "completed" | "failed";

function successEnvelope(resource: string, payload: unknown) {
  return {
    schema_version: 1,
    trace_id: `trace-${resource}`,
    ts: timestamp,
    result: {
      resource,
      payload,
    },
  };
}

async function fulfillSuccess(route: Route, status: number, resource: string, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(successEnvelope(resource, payload)),
  });
}

function builtInCommonsRef(): CouncilRef {
  return { kind: "built_in", slug: "commons" };
}

function userCouncilRef(): CouncilRef {
  return { kind: "user", councilId: 901 };
}

function encodeCouncilRef(ref: CouncilRef) {
  return ref.kind === "built_in" ? `built_in:${ref.slug}` : `user:${ref.councilId}`;
}

function phasePrompts() {
  return {
    phase1: "Answer precisely.",
    phase2: "Evaluate precisely.",
    phase3: "Synthesize precisely.",
  };
}

function outputFormats() {
  return {
    phase1: "Answer output.",
    phase2: "Evaluation JSON.",
    phase3: "Final answer output.",
  };
}

function councilMembers() {
  return [1, 2, 3, 4, 5, 6, 7].map((memberPosition) => ({
    memberPosition,
    model: {
      provider: "openrouter",
      modelId: `provider/model-${memberPosition}`,
    },
    tuning: null,
  }));
}

function councilListItem(ref: CouncilRef, name: string, editable: boolean) {
  return {
    ref,
    name,
    description: editable ? "Custom council" : "Built-in demo baseline",
    editable,
    deletable: editable,
  };
}

function councilDetail(ref: CouncilRef, name: string, editable: boolean) {
  return {
    ref,
    name,
    phasePrompts: phasePrompts(),
    outputFormats: outputFormats(),
    members: councilMembers(),
    editable,
    deletable: editable,
  };
}

function sessionSummary(input: {
  id: number;
  query: string;
  status: SessionStatus;
  councilName?: string;
}) {
  return {
    id: input.id,
    query: input.query,
    questionHash: `hash-${input.id}`,
    ingressSource: "web",
    ingressVersion: null,
    councilNameAtRun: input.councilName ?? "Commons",
    status: input.status,
    failureKind: input.status === "failed" ? "provider_error" : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    totalTokens: input.status === "completed" ? 42 : 0,
    totalCostUsdMicros: input.status === "completed" ? 123 : 0,
    totalCostIsPartial: false,
    totalCost: input.status === "completed" ? "0.000123" : "0.000000",
  };
}

function sessionSnapshot(input: {
  query: string;
  councilName?: string;
  attachments?: ReadonlyArray<Readonly<{ name: string; text: string }>>;
}) {
  return {
    version: 1,
    createdAt: timestamp,
    query: input.query,
    userMessage: input.query,
    attachments: input.attachments ?? [],
    outputFormats: outputFormats(),
    council: {
      nameAtRun: input.councilName ?? "Commons",
      phasePrompts: phasePrompts(),
      members: councilMembers(),
    },
  };
}

function sessionDetail(input: {
  id: number;
  query: string;
  status: SessionStatus;
  councilName?: string;
  attachments?: ReadonlyArray<Readonly<{ name: string; text: string }>>;
}) {
  return {
    session: {
      ...sessionSummary(input),
      snapshot: sessionSnapshot(input),
    },
    artifacts:
      input.status === "completed"
        ? [
            {
              id: input.id * 10,
              sessionId: input.id,
              phase: 3,
              artifactKind: "synthesis",
              memberPosition: 7,
              member: {
                position: 7,
                role: "synthesizer",
                alias: "G",
                label: "Synthesizer G",
              },
              modelId: "provider/model-7",
              modelName: "Model 7",
              content: "Final answer.",
              tokensUsed: 42,
              costUsdMicros: 123,
              createdAt: timestamp,
            },
          ]
        : [],
    providerCalls: [],
  };
}

function parseJsonBody(request: ReturnType<Route["request"]>) {
  const postData = request.postData();
  return postData ? (JSON.parse(postData) as unknown) : null;
}

function installApiMocks(page: Page) {
  const state = {
    userCouncilExists: false,
    createSessionBodies: [] as unknown[],
    duplicateBodies: [] as unknown[],
    saveBodies: [] as unknown[],
    deleteCount: 0,
    exportBodies: [] as unknown[],
    continueSessionIds: [] as number[],
    rerunBodies: [] as unknown[],
  };

  const sessions = new Map<number, ReturnType<typeof sessionSummary>>([
    [101, sessionSummary({ id: 101, query: "Recover broken run", status: "failed" })],
    [102, sessionSummary({ id: 102, query: "Completed wisdom", status: "completed" })],
  ]);

  page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === "/api/v1/auth/validate" && method === "POST") {
      await fulfillSuccess(route, 200, "auth.validate", { valid: true });
      return;
    }

    if (pathname === "/api/v1/councils" && method === "GET") {
      const councils = [councilListItem(builtInCommonsRef(), "Commons", false)];
      if (state.userCouncilExists) {
        councils.push(councilListItem(userCouncilRef(), "Commons Copy", true));
      }
      await fulfillSuccess(route, 200, "councils.list", { councils });
      return;
    }

    if (pathname === "/api/v1/councils/output-formats" && method === "GET") {
      await fulfillSuccess(route, 200, "councils.outputFormats", {
        outputFormats: outputFormats(),
      });
      return;
    }

    if (pathname === "/api/v1/councils/duplicate" && method === "POST") {
      state.duplicateBodies.push(parseJsonBody(request));
      state.userCouncilExists = true;
      await fulfillSuccess(route, 200, "councils.duplicate", { councilId: 901 });
      return;
    }

    if (pathname.startsWith("/api/v1/councils/")) {
      const locator = decodeURIComponent(pathname.replace("/api/v1/councils/", ""));
      const isUserCouncil = locator === encodeCouncilRef(userCouncilRef());
      if (method === "GET") {
        await fulfillSuccess(
          route,
          200,
          "councils.get",
          isUserCouncil
            ? councilDetail(userCouncilRef(), "Commons Copy", true)
            : councilDetail(builtInCommonsRef(), "Commons", false),
        );
        return;
      }
      if (method === "PUT") {
        state.saveBodies.push(parseJsonBody(request));
        await fulfillSuccess(route, 200, "councils.update", { success: true });
        return;
      }
      if (method === "DELETE") {
        state.deleteCount += 1;
        state.userCouncilExists = false;
        await fulfillSuccess(route, 200, "councils.delete", { success: true });
        return;
      }
    }

    if (pathname === "/api/v1/sessions" && method === "GET") {
      await fulfillSuccess(route, 200, "sessions.list", [...sessions.values()]);
      return;
    }

    if (pathname === "/api/v1/sessions" && method === "POST") {
      state.createSessionBodies.push(parseJsonBody(request));
      sessions.set(
        77,
        sessionSummary({ id: 77, query: "Question with evidence", status: "completed" }),
      );
      await fulfillSuccess(route, 201, "sessions.create", { sessionId: 77 });
      return;
    }

    if (pathname === "/api/v1/sessions/export" && method === "POST") {
      state.exportBodies.push(parseJsonBody(request));
      await fulfillSuccess(route, 200, "sessions.export", {
        markdown: "# Export",
        json: '{"ok":true}',
      });
      return;
    }

    const continueMatch = pathname.match(/^\/api\/v1\/sessions\/(\d+)\/continue$/);
    if (continueMatch && method === "POST") {
      const sessionId = Number.parseInt(continueMatch[1] ?? "", 10);
      state.continueSessionIds.push(sessionId);
      sessions.set(
        sessionId,
        sessionSummary({ id: sessionId, query: "Recover broken run", status: "processing" }),
      );
      await fulfillSuccess(route, 200, "sessions.continue", { sessionId });
      return;
    }

    const rerunMatch = pathname.match(/^\/api\/v1\/sessions\/(\d+)\/rerun$/);
    if (rerunMatch && method === "POST") {
      state.rerunBodies.push(parseJsonBody(request));
      sessions.set(103, sessionSummary({ id: 103, query: "Completed wisdom", status: "pending" }));
      await fulfillSuccess(route, 200, "sessions.rerun", { sessionId: 103 });
      return;
    }

    const sessionMatch = pathname.match(/^\/api\/v1\/sessions\/(\d+)$/);
    if (sessionMatch && method === "GET") {
      const sessionId = Number.parseInt(sessionMatch[1] ?? "", 10);
      const summary =
        sessions.get(sessionId) ??
        sessionSummary({ id: sessionId, query: "Question with evidence", status: "completed" });
      const attachments = sessionId === 77 ? [{ name: "notes.txt", text: "attached notes" }] : [];
      await fulfillSuccess(
        route,
        200,
        "sessions.get",
        sessionDetail({
          id: summary.id,
          query: summary.query,
          status: summary.status,
          councilName: summary.councilNameAtRun,
          attachments,
        }),
      );
      return;
    }

    await route.fulfill({ status: 404, body: `Unhandled ${method} ${pathname}` });
  });

  return state;
}

async function unlockByok(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("seven.encrypted_api_key");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Bring Your Own Key" }).click();
  await page.getByLabel("OpenRouter API Key").fill("sk-or-valid-browser-proof");
  await page.getByLabel("Local Password").fill("browser-proof-password");
  await page.getByRole("button", { name: "Validate and Unlock" }).click();
  await expect(page.getByText("BYOK", { exact: true }).first()).toBeVisible();
}

test("BYOK unlock, attachment submit, and lock are browser-proven", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page);

  await page.getByLabel("Question").fill("Question with evidence");
  await page.setInputFiles("#ask-attachments", {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("attached notes"),
  });
  await expect(page.getByText("notes.txt")).toBeVisible();

  await page.getByRole("button", { name: "Send to The Seven" }).click();
  await expect.poll(() => state.createSessionBodies.length).toBe(1);
  expect(state.createSessionBodies[0]).toEqual({
    query: "Question with evidence",
    councilRef: builtInCommonsRef(),
    attachments: [{ name: "notes.txt", base64: "YXR0YWNoZWQgbm90ZXM=" }],
  });
  await expect(page.getByText("1 attachment(s)")).toBeVisible();

  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock Stored Key" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("seven.encrypted_api_key")))
    .not.toBeNull();
});

test("council duplicate, edit, save, and delete are browser-proven", async ({ page }) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Councils" }).click();
  await expect(page.getByRole("heading", { name: "Councils" })).toBeVisible();

  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect.poll(() => state.duplicateBodies.length).toBe(1);
  expect(state.duplicateBodies[0]).toEqual({
    source: builtInCommonsRef(),
    name: "Commons Copy",
  });

  await expect(page.getByLabel("Name")).toHaveValue("Commons Copy");
  await page.getByLabel("Name").fill("Launch Council");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => state.saveBodies.length).toBe(1);
  expect(state.saveBodies[0]).toMatchObject({
    name: "Launch Council",
    phasePrompts: phasePrompts(),
  });

  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => state.deleteCount).toBe(1);
});

test("sessions search, select, export, continue, and rerun are browser-proven", async ({
  page,
}) => {
  const state = installApiMocks(page);
  await unlockByok(page);
  await page.getByRole("link", { name: "Sessions" }).click();

  await expect(page.locator(".panel", { hasText: "Recover broken run" })).toBeVisible();
  await expect(page.locator(".panel", { hasText: "Completed wisdom" })).toBeVisible();

  await page.getByPlaceholder("Search query or council").fill("Recover");
  await expect(page.locator(".panel", { hasText: "Recover broken run" })).toBeVisible();
  await expect(page.locator(".panel", { hasText: "Completed wisdom" })).toBeHidden();
  await page.getByPlaceholder("Search query or council").fill("");

  const failedRow = page.locator(".panel", { hasText: "Recover broken run" });
  await failedRow.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Export Selected" }).click();
  await expect.poll(() => state.exportBodies.length).toBe(1);
  expect(state.exportBodies[0]).toEqual({ sessionIds: [101] });

  await failedRow.getByRole("button", { name: "Continue" }).click();
  await expect.poll(() => state.continueSessionIds).toEqual([101]);

  const completedRow = page.locator(".panel", { hasText: "Completed wisdom" });
  await completedRow.click();
  await expect(page.locator(".ask-question").getByText("Completed wisdom")).toBeVisible();
  await completedRow.getByRole("button", { name: "Rerun" }).click();
  await expect.poll(() => state.rerunBodies.length).toBe(1);
  expect(state.rerunBodies[0]).toEqual({
    councilRef: builtInCommonsRef(),
  });
  await expect(page.getByText("New run created")).toBeVisible();
});
