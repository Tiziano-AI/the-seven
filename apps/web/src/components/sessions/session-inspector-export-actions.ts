"use client";

import { toast } from "sonner";
import type { fetchSession } from "@/lib/api";
import { exportSessions } from "@/lib/api";
import type { SessionExportAction } from "./session-export-panel";
import {
  buildAnswerMarkdown,
  buildAnswerWithNotes,
  downloadText,
} from "./session-inspector-formatters";

type SessionDetail = Awaited<ReturnType<typeof fetchSession>>;
type ExportAction = Exclude<SessionExportAction, null>;

type SessionExportHandlersInput = Readonly<{
  authenticated: boolean;
  authHeader: string | null;
  detail: SessionDetail;
  exportAction: SessionExportAction;
  onAuthorityDenial?: (error: unknown) => boolean;
  onAuthorityDenied: () => void;
  setExportAction: (action: SessionExportAction) => void;
}>;

type SessionExportHandlers = Readonly<{
  handleCopyAnswer: () => Promise<void>;
  handleCopyAnswerWithNotes: () => Promise<void>;
  handleCopyLink: () => Promise<void>;
  handleDownloadAnswer: () => Promise<void>;
  handleDownloadFullRecord: () => Promise<void>;
}>;

function currentRunLink(sessionId: number) {
  if (typeof window === "undefined") return `/sessions/${sessionId}`;
  return `${window.location.origin}/sessions/${sessionId}`;
}

async function copyText(text: string, successMessage: string) {
  await navigator.clipboard.writeText(text);
  toast.success(successMessage);
}

/** Builds the copy and download handlers for the selected run without owning inspector state. */
export function createSessionExportHandlers(
  input: SessionExportHandlersInput,
): SessionExportHandlers {
  async function runExportAction(action: ExportAction, operation: () => Promise<void>) {
    if (input.exportAction !== null) return;
    input.setExportAction(action);
    try {
      await operation();
    } catch (error) {
      if (input.onAuthorityDenial?.(error)) {
        input.onAuthorityDenied();
        return;
      }
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      input.setExportAction(null);
    }
  }

  async function handleDownloadFullRecord() {
    if (!input.authenticated || !input.authHeader) return;
    await runExportAction("download-record", async () => {
      const exported = await exportSessions(input.authHeader, [input.detail.session.id]);
      downloadText(
        `full-record-${input.detail.session.id}.json`,
        exported.json,
        "application/json",
      );
      toast.success("Full record downloaded");
    });
  }

  async function handleDownloadAnswer() {
    await runExportAction("download-answer", async () => {
      const phase3Artifact = input.detail.artifacts.find((artifact) => artifact.phase === 3);
      const markdown = buildAnswerMarkdown({
        sessionId: input.detail.session.id,
        question: input.detail.session.query,
        councilName: input.detail.session.councilNameAtRun,
        status: input.detail.session.status,
        answer: phase3Artifact?.content ?? null,
        link: currentRunLink(input.detail.session.id),
      });
      downloadText(`answer-${input.detail.session.id}.md`, markdown, "text/markdown");
      toast.success("Answer downloaded");
    });
  }

  async function handleCopyAnswer() {
    await runExportAction("copy-answer", async () => {
      const phase3Artifact = input.detail.artifacts.find((artifact) => artifact.phase === 3);
      await copyText(
        phase3Artifact?.content?.trim() || "No answer text is available for this run.",
        "Answer copied",
      );
    });
  }

  async function handleCopyAnswerWithNotes() {
    await runExportAction("copy-notes", async () => {
      const phase3Artifact = input.detail.artifacts.find((artifact) => artifact.phase === 3);
      const text = buildAnswerWithNotes({
        question: input.detail.session.query,
        councilName: input.detail.session.councilNameAtRun,
        status: input.detail.session.status,
        answer: phase3Artifact?.content ?? null,
        artifactCount: input.detail.artifacts.length,
        reviewCount: input.detail.artifacts.filter((artifact) => artifact.phase === 2).length,
        link: currentRunLink(input.detail.session.id),
      });
      await copyText(text, "Answer with notes copied");
    });
  }

  async function handleCopyLink() {
    await runExportAction("copy-link", async () => {
      await copyText(currentRunLink(input.detail.session.id), "Private link copied");
    });
  }

  return {
    handleCopyAnswer,
    handleCopyAnswerWithNotes,
    handleCopyLink,
    handleDownloadAnswer,
    handleDownloadFullRecord,
  };
}
