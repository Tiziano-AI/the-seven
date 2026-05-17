"use client";

import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import { HomeAuthGate } from "@/components/screens/home-auth-gate";
import { HomeQuestionComposer } from "@/components/screens/home-question-composer";
import {
  councilChoiceValue,
  demoLinkBannerMessage,
} from "@/components/screens/home-screen-formatters";
import { HomeSessionWorkbench } from "@/components/screens/home-session-workbench";
import { SessionInspector } from "@/components/sessions/session-inspector";
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

const BYOK_KEY_REJECTION_GUIDANCE = [
  "OpenRouter rejected this key.",
  "Check that this is a valid OpenRouter API key, or use the 24-hour demo instead.",
].join(" ");

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
  const [byokKeyIssue, setByokKeyIssue] = useState<string | null>(null);
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
    <HomeQuestionComposer
      activeSessionId={activeSessionId}
      authMode={auth.mode}
      selectedCouncilName={selectedCouncilName}
      query={query}
      submitting={submitting}
      canSubmitWithCouncil={Boolean(selectedCouncilRef)}
      postSubmitComposerNoteVisible={postSubmitComposerNoteVisible}
      canReuseLastQuestion={Boolean(lastSubmittedQuestion)}
      demoByokConfirmOpen={demoByokConfirmOpen}
      demoByokEnding={demoByokEnding}
      demoByokError={demoByokError}
      availableCouncils={availableCouncils}
      selectedCouncil={selectedCouncil}
      selectedFiles={selectedFiles}
      onQueryChange={setQuery}
      onSubmitQuestion={handleSubmitQuestion}
      onReuseLastQuestion={() => {
        if (lastSubmittedQuestion) setQuery(lastSubmittedQuestion);
      }}
      onDismissPostSubmitComposerNote={() => setPostSubmitComposerNoteVisible(false)}
      onSelectCouncil={setSelectedCouncil}
      onFilesSelected={setSelectedFiles}
      onRemoveFile={(index) => {
        setSelectedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
      }}
      onClearFiles={() => setSelectedFiles([])}
      onRequestByokFromDemo={() => {
        setDemoByokError(null);
        setDemoByokConfirmOpen(true);
      }}
      onCancelDemoByok={() => {
        setDemoByokError(null);
        setDemoByokConfirmOpen(false);
      }}
      onConfirmDemoByok={handleEndDemoAndOpenByok}
    />
  );

  async function handleValidateAndStore() {
    try {
      if (!canAdmitByokUnlock()) {
        return;
      }
      setByokKeyIssue(null);
      setByokValidationPending(true);
      const validation = await validateByokKey(apiKey);
      if (!validation.valid) {
        setByokKeyIssue(BYOK_KEY_REJECTION_GUIDANCE);
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
      setByokKeyIssue(null);
      setHasStoredByok(true);
      toast.success("OpenRouter key unlocked");
    } catch (error) {
      if (error instanceof ApiErrorResponse && error.kind === "unauthorized") {
        setByokKeyIssue(BYOK_KEY_REJECTION_GUIDANCE);
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
        byokKeyIssue={byokKeyIssue}
        apiKey={apiKey}
        password={password}
        resetKeyConfirmOpen={resetKeyConfirmOpen}
        onDemoEmailChange={setDemoEmail}
        onRequestDemo={handleRequestDemo}
        onOpenByok={() => {
          setByokKeyIssue(null);
          setByokOpen(true);
        }}
        onRetryDemoSession={() => {
          void auth.refreshDemoSession();
        }}
        onApiKeyChange={(value) => {
          setApiKey(value);
          if (byokKeyIssue) setByokKeyIssue(null);
        }}
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
