import express from "express";
import { randomUUID } from "crypto";
import { createRequestContext } from "./context";
import { sendError, sendSuccess } from "./envelopes";
import { EdgeError } from "./errors";
import { errorToLogFields, log } from "../../_core/log";
import { handleValidateKey } from "./authHandlers";
import { handleDemoConsume, handleDemoRequest } from "./demoHandlers";
import {
  handleCouncilsList,
  handleCouncilDelete,
  handleCouncilDuplicate,
  handleCouncilGet,
  handleCouncilUpdate,
  handleOutputFormats,
} from "./councilHandlers";
import { handleModelAutocomplete, handleModelValidate } from "./modelHandlers";
import {
  handleContinueSession,
  handleQuerySubmit,
  handleRerunSession,
} from "./querySubmitHandlers";
import { handleGetSession, handleListSessions } from "./querySessionHandlers";
import { handleSessionDiagnostics } from "./queryDiagnosticsHandlers";

type Handler = (ctx: Awaited<ReturnType<typeof createRequestContext>>, req: express.Request) => Promise<unknown>;

function parsePositiveInt(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Invalid ${label}`,
      details: { issues: [{ path: label, message: `Invalid ${label}` }] },
      status: 400,
    });
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new EdgeError({
      kind: "invalid_input",
      message: `Invalid ${label}`,
      details: { issues: [{ path: label, message: `Invalid ${label}` }] },
      status: 400,
    });
  }
  return parsed;
}

async function handleRequest(params: {
  req: express.Request;
  res: express.Response;
  resource: string;
  handler: Handler;
  status?: number;
}): Promise<void> {
  const ctx = await createRequestContext(params.req, params.res);
  try {
    const payload = await params.handler(ctx, params.req);
    sendSuccess(params.res, {
      traceId: ctx.traceId,
      resource: params.resource,
      payload,
      now: ctx.now,
      status: params.status,
    });
  } catch (error: unknown) {
    if (error instanceof EdgeError) {
      sendError(params.res, {
        traceId: ctx.traceId,
        kind: error.kind,
        message: error.message,
        details: error.details,
        now: ctx.now,
        status: error.status,
      });
      return;
    }

    const errorId = randomUUID();
    log("error", "api_request_failed", {
      trace_id: ctx.traceId,
      error_id: errorId,
      ...errorToLogFields(error),
    });
    sendError(params.res, {
      traceId: ctx.traceId,
      kind: "internal_error",
      message: "Internal server error",
      details: { error_id: errorId },
      now: ctx.now,
      status: 500,
    });
  }
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.post("/auth/validate", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "auth.validate",
      handler: (ctx) => handleValidateKey(ctx),
    })
  );

  router.post("/demo/request", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "demo.request",
      handler: (ctx) => handleDemoRequest(ctx, req.body),
    })
  );

  router.post("/demo/consume", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "demo.consume",
      handler: (ctx) => handleDemoConsume(ctx, req.body),
    })
  );

  router.get("/councils", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "councils.list",
      handler: (ctx) => handleCouncilsList(ctx),
    })
  );

  router.get("/councils/output-formats", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "councils.output_formats",
      handler: (ctx) => handleOutputFormats(ctx),
    })
  );

  router.get("/councils/:ref", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "councils.get",
      handler: (ctx, request) => handleCouncilGet(ctx, request.params.ref ?? ""),
    })
  );

  router.post("/councils/duplicate", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "councils.duplicate",
      handler: (ctx) => handleCouncilDuplicate(ctx, req.body),
    })
  );

  router.put("/councils/:id", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "councils.update",
      handler: (ctx, request) => handleCouncilUpdate(ctx, parsePositiveInt(request.params.id, "councilId"), req.body),
    })
  );

  router.delete("/councils/:id", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "councils.delete",
      handler: (ctx, request) => handleCouncilDelete(ctx, parsePositiveInt(request.params.id, "councilId")),
    })
  );

  router.post("/models/validate", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "models.validate",
      handler: (ctx) => handleModelValidate(ctx, req.body),
    })
  );

  router.post("/models/autocomplete", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "models.autocomplete",
      handler: (ctx) => handleModelAutocomplete(ctx, req.body),
    })
  );

  router.post("/query/submit", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "query.submit",
      handler: (ctx) => handleQuerySubmit(ctx, req.body),
    })
  );

  router.post("/query/continue", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "query.continue",
      handler: (ctx) => handleContinueSession(ctx, req.body),
    })
  );

  router.post("/query/rerun", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "query.rerun",
      handler: (ctx) => handleRerunSession(ctx, req.body),
    })
  );

  router.get("/query/sessions", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "query.list_sessions",
      handler: (ctx) => handleListSessions(ctx),
    })
  );

  router.get("/query/sessions/:id", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "query.get_session",
      handler: (ctx, request) => handleGetSession(ctx, parsePositiveInt(request.params.id, "sessionId")),
    })
  );

  router.get("/query/sessions/:id/diagnostics", (req, res) =>
    void handleRequest({
      req,
      res,
      resource: "query.session_diagnostics",
      handler: (ctx, request) => handleSessionDiagnostics(ctx, parsePositiveInt(request.params.id, "sessionId")),
    })
  );

  return router;
}
