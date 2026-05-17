"use client";

import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import { DemoEndConfirmation } from "@/components/app/demo-end-confirmation";
import { HomeAuthGate } from "@/components/screens/home-auth-gate";
import {
  AskAnotherQuestionPanel,
  CouncilChoicePanel,
  DemoCouncilPanel,
  EvidencePicker,
} from "@/components/screens/home-petition-panels";
import {
  councilChoiceValue,
  demoLinkBannerMessage,
} from "@/components/screens/home-screen-formatters";
import { HomeSessionWorkbench } from "@/components/screens/home-session-workbench";
import { SessionInspector } from "@/components/sessions/session-inspector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createSession,
  fetchCouncils,
  readCouncilRef,
  requestDemoLink,
  validateByokKey,
} from "@/lib/api";
import { ApiErrorResponse } from "@/lib/apiClient";
import { decryptStoredApiKey, encryptAndStoreApiKey, hasEncryptedKey } from "@/lib/crypto";
import { fileToBase64 } from "@/lib/files";
import {
  FOUNDING_COUNCIL_CHOICE,
  readActiveSessionId,
  readDraftQuery,
  readLastCouncilRef,
  writeActiveSessionId,
  writeDraftQuery,
  writeLastCouncilRef,
} from "@/lib/storage";

export function HomeScreen() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const demoLinkState = searchParams.get("demo_link");
  const unlockMode = searchParams.get("unlock");
  const [hasStoredByok, setHasStoredByok] = useState(false);
  const [byokOpen, setByokOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [demoReceiptEmail, setDemoReceiptEmail] = useState<string | null>(null);
  const [demoRequestPending, setDemoRequestPending] = useState(false);
  const [query, setQuery] = useState("");
  const [lastSubmittedQuestion, setLastSubmittedQuestion] = useState<string | null>(null);
  const [selectedCouncil, setSelectedCouncil] = useState("");
  const [availableCouncils, setAvailableCouncils] = useState<
    Awaited<ReturnType<typeof fetchCouncils>>["councils"]
  >([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [postSubmitComposerNoteVisible, setPostSubmitComposerNoteVisible] = useState(true);
  const [demoByokConfirmOpen, setDemoByokConfirmOpen] = useState(false);
  const [demoByokEnding, setDemoByokEnding] = useState(false);
  const [demoByokError, setDemoByokError] = useState<string | null>(null);
  const [byokValidationPending, setByokValidationPending] = useState(false);
  const [byokUnlockPending, setByokUnlockPending] = useState(false);
  const [resetKeyConfirmOpen, setResetKeyConfirmOpen] = useState(false);

  useEffect(() => {
    const stored = hasEncryptedKey();
    setHasStoredByok(stored);
    setByokOpen(stored || unlockMode === "byok");
    setQuery(readDraftQuery());
    setActiveSessionId(readActiveSessionId());
  }, [unlockMode]);

  useEffect(() => {
    writeDraftQuery(query);
  }, [query]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setAvailableCouncils([]);
      return;
    }

    void fetchCouncils(auth.authHeader)
      .then((result) => {
        setAvailableCouncils(result.councils);
        const stored = readLastCouncilRef();
        const fallback = result.councils[0];
        const next =
          result.councils.find((council) => councilChoiceValue(council) === stored) ?? fallback;

        if (next) {
          setSelectedCouncil(councilChoiceValue(next));
        }
      })
      .catch((error) => {
        if (auth.handleAuthorityDenial(error)) {
          return;
        }
        toast.error(error instanceof Error ? error.message : "Failed to load councils");
      });
  }, [auth]);

  useEffect(() => {
    if (selectedCouncil) {
      writeLastCouncilRef(selectedCouncil);
    }
  }, [selectedCouncil]);

  const selectedCouncilRef = useMemo(() => {
    return readCouncilRef(selectedCouncil);
  }, [selectedCouncil]);

  const selectedCouncilName = useMemo(() => {
    const found = availableCouncils.find((council) => {
      const encoded =
        council.ref.kind === "built_in"
          ? `built_in:${council.ref.slug}`
          : `user:${council.ref.councilId}`;
      return encoded === selectedCouncil;
    });
    return found?.name ?? "";
  }, [availableCouncils, selectedCouncil]);

  function canAdmitByokUnlock() {
    if (auth.demoSessionLoading) {
      toast.message("Checking for an active demo session before using your key.");
      return false;
    }
    if (auth.demoSessionProbeFailed) {
      toast.error(
        "Demo session status is unavailable. Retry the demo status check before using your key.",
      );
      return false;
    }
    if (auth.demoSession) {
      setDemoByokError(null);
      setDemoByokConfirmOpen(true);
      toast.message("End the active demo session before using your key.");
      return false;
    }
    return true;
  }

  const inspector = (
    <SessionInspector
      authenticated={auth.isAuthenticated}
      authHeader={auth.authHeader}
      sessionId={activeSessionId}
      onAuthorityDenial={auth.handleAuthorityDenial}
      onSpawnedSession={(sessionId) => {
        setActiveSessionId(sessionId);
        writeActiveSessionId(sessionId);
      }}
    />
  );

  const composer = (
    <Card className={activeSessionId ? "p-4" : "p-5"}>
      <section className="petition-band">
        <p className="docket-meta">
          {auth.mode === "demo" ? (
            <>
              <span>Demo</span>
              <span className="docket-meta-pair">
                <span className="docket-dot">·</span>
                <span className="docket-accent">
                  {selectedCouncilName || "The Commons Council"}
                </span>
              </span>
            </>
          ) : (
            <>
              <span>Ask</span>
              {selectedCouncilName ? (
                <span className="docket-meta-pair">
                  <span className="docket-dot">·</span>
                  <span className="docket-accent">{selectedCouncilName}</span>
                </span>
              ) : null}
            </>
          )}
        </p>

        <form className="workbench-form" onSubmit={handleSubmitQuestion}>
          {activeSessionId && postSubmitComposerNoteVisible ? (
            <AskAnotherQuestionPanel
              canReuseLastQuestion={Boolean(lastSubmittedQuestion)}
              onReuseLastQuestion={() => {
                if (lastSubmittedQuestion) setQuery(lastSubmittedQuestion);
              }}
              onDismiss={() => setPostSubmitComposerNoteVisible(false)}
            />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="matter-question">Question</Label>
            <Textarea
              id="matter-question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSubmitQuestion();
                }
              }}
              placeholder="Ask a question for the council to answer."
              className={activeSessionId ? "min-h-[92px]" : "min-h-[150px]"}
            />
          </div>
          {auth.mode === "demo" ? (
            <>
              <DemoCouncilPanel
                onUnlockByok={() => {
                  setDemoByokError(null);
                  setDemoByokConfirmOpen(true);
                }}
              />
              {demoByokConfirmOpen ? (
                <DemoEndConfirmation
                  title="End demo session and use your key?"
                  body="The server ends the demo session before the browser cookie is cleared. Your OpenRouter key can be used after the demo session closes."
                  confirmLabel="End demo and use your key"
                  pendingLabel="Ending demo…"
                  pending={demoByokEnding}
                  error={demoByokError}
                  onCancel={() => {
                    setDemoByokError(null);
                    setDemoByokConfirmOpen(false);
                  }}
                  onConfirm={handleEndDemoAndOpenByok}
                />
              ) : null}
            </>
          ) : (
            <CouncilChoicePanel
              councils={availableCouncils}
              selectedCouncil={selectedCouncil}
              onSelectCouncil={setSelectedCouncil}
            />
          )}
          <EvidencePicker
            selectedFiles={selectedFiles}
            onFilesSelected={setSelectedFiles}
            onRemoveFile={(index) => {
              setSelectedFiles((current) =>
                current.filter((_, currentIndex) => currentIndex !== index),
              );
            }}
            onClearFiles={() => setSelectedFiles([])}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={submitting || !query.trim() || !selectedCouncilRef}
              size={activeSessionId ? "default" : "lg"}
            >
              {submitting ? "Asking…" : "Ask the council"}
            </Button>
            <span className="text-xs text-[var(--text-dim)]">
              ⌘/Ctrl+Enter asks · drafts persist locally
            </span>
          </div>
        </form>
      </section>
    </Card>
  );

  async function handleValidateAndStore() {
    try {
      if (!canAdmitByokUnlock()) {
        return;
      }
      setByokValidationPending(true);
      const validation = await validateByokKey(apiKey);
      if (!validation.valid) {
        toast.error("OpenRouter rejected this key");
        return;
      }
      if (!canAdmitByokUnlock()) {
        return;
      }
      await encryptAndStoreApiKey(password, apiKey);
      setSelectedCouncil(FOUNDING_COUNCIL_CHOICE);
      writeLastCouncilRef(FOUNDING_COUNCIL_CHOICE);
      auth.setByokKey(apiKey);
      setApiKey("");
      setPassword("");
      setHasStoredByok(true);
      toast.success("OpenRouter key unlocked");
    } catch (error) {
      if (error instanceof ApiErrorResponse && error.kind === "unauthorized") {
        toast.error("OpenRouter rejected this key");
        return;
      }
      if (
        error instanceof ApiErrorResponse &&
        error.kind === "forbidden" &&
        error.forbiddenReason === "demo_not_allowed"
      ) {
        setDemoByokError(null);
        setDemoByokConfirmOpen(true);
        toast.message("End the active demo session before using your key.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Key setup failed");
    } finally {
      setByokValidationPending(false);
    }
  }

  async function handleUnlockStoredKey() {
    try {
      if (!canAdmitByokUnlock()) {
        return;
      }
      setByokUnlockPending(true);
      const decryptedKey = await decryptStoredApiKey(password);
      const validation = await validateByokKey(decryptedKey);
      if (!validation.valid) {
        setPassword("");
        toast.error("OpenRouter rejected the stored key");
        return;
      }
      if (!canAdmitByokUnlock()) {
        setPassword("");
        return;
      }
      setSelectedCouncil(FOUNDING_COUNCIL_CHOICE);
      writeLastCouncilRef(FOUNDING_COUNCIL_CHOICE);
      auth.setByokKey(decryptedKey);
      setPassword("");
      toast.success("OpenRouter key unlocked");
    } catch (error) {
      if (error instanceof ApiErrorResponse && error.kind === "unauthorized") {
        setPassword("");
        toast.error("OpenRouter rejected the stored key");
        return;
      }
      if (
        error instanceof ApiErrorResponse &&
        error.kind === "forbidden" &&
        error.forbiddenReason === "demo_not_allowed"
      ) {
        setDemoByokError(null);
        setDemoByokConfirmOpen(true);
        setPassword("");
        toast.message("End the active demo session before using your key.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Unlock failed");
    } finally {
      setByokUnlockPending(false);
    }
  }

  async function handleRequestDemo() {
    if (demoRequestPending) return;
    setDemoRequestPending(true);
    try {
      const result = await requestDemoLink(demoEmail);
      setDemoReceiptEmail(result.email);
      toast.success(`Magic link sent to ${result.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request demo link");
    } finally {
      setDemoRequestPending(false);
    }
  }

  async function handleEndDemoAndOpenByok() {
    setDemoByokEnding(true);
    setDemoByokError(null);
    try {
      await auth.clearDemoSession();
      setSelectedCouncil(FOUNDING_COUNCIL_CHOICE);
      writeLastCouncilRef(FOUNDING_COUNCIL_CHOICE);
      setByokOpen(true);
      setDemoByokConfirmOpen(false);
      toast.success("Demo ended. Founding is selected for your key.");
    } catch (error) {
      setDemoByokError(error instanceof Error ? error.message : "Demo logout failed");
    } finally {
      setDemoByokEnding(false);
    }
  }

  async function handleSubmitQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const question = query.trim();
    if (submitting) return;
    if (!auth.isAuthenticated || !selectedCouncilRef) {
      toast.error("Choose a council first");
      return;
    }
    if (!question) {
      toast.error("Write a question before asking.");
      return;
    }

    setSubmitting(true);
    try {
      const attachments = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: file.name,
          base64: await fileToBase64(file),
        })),
      );

      const result = await createSession({
        authHeader: auth.authHeader,
        query: question,
        councilRef: selectedCouncilRef,
        attachments,
      });
      setActiveSessionId(result.sessionId);
      writeActiveSessionId(result.sessionId);
      setLastSubmittedQuestion(question);
      setPostSubmitComposerNoteVisible(true);
      setQuery("");
      writeDraftQuery("");
      setSelectedFiles([]);
      toast.success("Question sent");
    } catch (error) {
      if (auth.handleAuthorityDenial(error)) {
        return;
      }
      const message =
        error instanceof ApiErrorResponse
          ? error.message
          : error instanceof Error
            ? error.message
            : "Ask failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <HomeAuthGate
        demoLinkState={demoLinkState}
        bannerMessage={demoLinkState ? demoLinkBannerMessage(demoLinkState) : ""}
        demoEmail={demoEmail}
        demoReceiptEmail={demoReceiptEmail}
        byokOpen={byokOpen}
        hasStoredByok={hasStoredByok}
        demoRequestPending={demoRequestPending}
        byokAdmissionPending={auth.demoSessionLoading}
        byokValidationPending={byokValidationPending}
        byokUnlockPending={byokUnlockPending}
        byokAdmissionBlocked={auth.demoSessionProbeFailed}
        apiKey={apiKey}
        password={password}
        resetKeyConfirmOpen={resetKeyConfirmOpen}
        onDemoEmailChange={setDemoEmail}
        onRequestDemo={handleRequestDemo}
        onOpenByok={() => setByokOpen(true)}
        onRetryDemoSession={() => {
          void auth.refreshDemoSession();
        }}
        onApiKeyChange={setApiKey}
        onPasswordChange={setPassword}
        onValidateAndStore={handleValidateAndStore}
        onUnlockStoredKey={handleUnlockStoredKey}
        onOpenResetKeyConfirm={() => setResetKeyConfirmOpen(true)}
        onCancelResetKey={() => setResetKeyConfirmOpen(false)}
        onConfirmResetKey={() => {
          auth.resetEncryptedKey();
          setHasStoredByok(false);
          setResetKeyConfirmOpen(false);
          setPassword("");
          toast.success("Stored key removed from this browser");
        }}
      />
    );
  }

  return (
    <HomeSessionWorkbench
      activeSessionId={activeSessionId}
      inspector={inspector}
      composer={composer}
    />
  );
}
