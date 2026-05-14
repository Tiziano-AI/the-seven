"use client";

import { FILE_INPUT_ACCEPT } from "@the-seven/contracts";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import { SessionInspector } from "@/components/sessions/session-inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  readActiveSessionId,
  readDraftQuery,
  readLastCouncilRef,
  writeActiveSessionId,
  writeDraftQuery,
  writeLastCouncilRef,
} from "@/lib/storage";

function demoLinkBannerMessage(state: string): string {
  if (state === "expired") {
    return "Your demo link expired. Request a fresh one below.";
  }
  if (state === "disabled") {
    return "Demo mode is unavailable right now. Bring your own key instead, or try again later.";
  }
  return "That demo link is invalid or already used. Request a fresh one below.";
}

export function HomeScreen() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const demoLinkState = searchParams.get("demo_link");
  const [hasStoredByok, setHasStoredByok] = useState(false);
  const [byokOpen, setByokOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCouncil, setSelectedCouncil] = useState("");
  const [availableCouncils, setAvailableCouncils] = useState<
    Awaited<ReturnType<typeof fetchCouncils>>["councils"]
  >([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  useEffect(() => {
    const stored = hasEncryptedKey();
    setHasStoredByok(stored);
    setByokOpen(stored);
    setQuery(readDraftQuery());
    setActiveSessionId(readActiveSessionId());
  }, []);

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
          result.councils.find((council) => {
            const encoded =
              council.ref.kind === "built_in"
                ? `built_in:${council.ref.slug}`
                : `user:${council.ref.councilId}`;
            return encoded === stored;
          }) ?? fallback;

        if (next) {
          setSelectedCouncil(
            next.ref.kind === "built_in"
              ? `built_in:${next.ref.slug}`
              : `user:${next.ref.councilId}`,
          );
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load councils");
      });
  }, [auth.authHeader, auth.isAuthenticated]);

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

  async function handleValidateAndStore() {
    try {
      const validation = await validateByokKey(apiKey);
      if (!validation.valid) {
        toast.error("OpenRouter rejected this key");
        return;
      }
      await encryptAndStoreApiKey(password, apiKey);
      auth.setByokKey(apiKey);
      setApiKey("");
      setPassword("");
      setHasStoredByok(true);
      toast.success("BYOK session unlocked");
    } catch (error) {
      if (error instanceof ApiErrorResponse && error.kind === "unauthorized") {
        toast.error("OpenRouter rejected this key");
        return;
      }
      toast.error(error instanceof Error ? error.message : "BYOK setup failed");
    }
  }

  async function handleUnlockStoredKey() {
    try {
      auth.setByokKey(await decryptStoredApiKey(password));
      setPassword("");
      toast.success("BYOK session unlocked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unlock failed");
    }
  }

  async function handleRequestDemo() {
    try {
      const result = await requestDemoLink(demoEmail);
      toast.success(`Magic link sent to ${result.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request demo link");
    }
  }

  async function handleSubmitQuestion() {
    if (!auth.isAuthenticated || !selectedCouncilRef) {
      toast.error("Choose a council first");
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
        query,
        councilRef: selectedCouncilRef,
        attachments,
      });
      setActiveSessionId(result.sessionId);
      writeActiveSessionId(result.sessionId);
      setSelectedFiles([]);
      toast.success("Run submitted");
    } catch (error) {
      const message =
        error instanceof ApiErrorResponse
          ? error.message
          : error instanceof Error
            ? error.message
            : "Submit failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <Card className="gate">
        {demoLinkState ? (
          <div role="status" className="gate-banner">
            {demoLinkBannerMessage(demoLinkState)}
          </div>
        ) : null}

        <div>
          <p className="gate-eyebrow">Convene the council</p>
          <h1 className="gate-headline mt-2">
            Seven minds, one verdict — read every line of reasoning.
          </h1>
          <p className="gate-lede mt-4">
            The Seven runs your question past six independent reviewers, has them critique each
            other&rsquo;s answers, and asks a seventh to deliver the verdict. Every draft, every
            disagreement, every citation stays inspectable.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="demo-email">Email for a 24-hour demo session</Label>
            <Input
              id="demo-email"
              type="email"
              value={demoEmail}
              onChange={(event) => setDemoEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <p className="text-xs text-[var(--text-dim)]">
              We email a magic link. The demo uses the Commons Council and our provider credentials
              — your key is not required.
            </p>
          </div>
          <Button onClick={handleRequestDemo} disabled={!demoEmail} size="lg" className="w-full">
            Send Magic Link
          </Button>
        </div>

        <div className="gate-divider">or use your own OpenRouter key</div>

        {!byokOpen ? (
          <button type="button" className="gate-secondary-link" onClick={() => setByokOpen(true)}>
            Bring Your Own Key — unlock every built-in council
          </button>
        ) : (
          <div className="space-y-3">
            <Badge className="badge-accent">BYOK</Badge>
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              Your OpenRouter key is encrypted locally in this browser. The server sees the
              plaintext transiently per request and stores durable worker credentials as encrypted
              job blobs.
            </p>
            {!hasStoredByok ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="byok-api-key">OpenRouter API Key</Label>
                  <Input
                    id="byok-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="sk-or-v1-..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="byok-password">Local Password</Label>
                  <Input
                    id="byok-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={handleValidateAndStore}
                  disabled={!apiKey || password.length < 8}
                >
                  Validate and Unlock
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="unlock-password">Unlock Password</Label>
                  <Input
                    id="unlock-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Decrypt your stored key"
                  />
                </div>
                <Button variant="secondary" onClick={handleUnlockStoredKey} disabled={!password}>
                  Unlock Stored Key
                </Button>
                <button
                  type="button"
                  className="gate-secondary-link"
                  onClick={() => {
                    auth.resetEncryptedKey();
                    setHasStoredByok(false);
                  }}
                >
                  Use a different key
                </button>
              </>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <section className="ask-band">
        <p className="ask-meta">
          {auth.mode === "demo" ? (
            <>
              <span>Demo session</span>
              <span className="ask-meta-dot">·</span>
              <span className="ask-meta-council">{selectedCouncilName || "Commons"}</span>
            </>
          ) : (
            <>
              <span>Ask the council</span>
              {selectedCouncilName ? (
                <>
                  <span className="ask-meta-dot">·</span>
                  <span className="ask-meta-council">{selectedCouncilName}</span>
                </>
              ) : null}
            </>
          )}
        </p>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="ask-council">Council</Label>
            <Select
              id="ask-council"
              value={selectedCouncil}
              onChange={(event) => setSelectedCouncil(event.target.value)}
            >
              {availableCouncils.map((council) => {
                const value =
                  council.ref.kind === "built_in"
                    ? `built_in:${council.ref.slug}`
                    : `user:${council.ref.councilId}`;
                return (
                  <option key={value} value={value}>
                    {council.name}
                  </option>
                );
              })}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ask-question">Question</Label>
            <Textarea
              id="ask-question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSubmitQuestion();
                }
              }}
              placeholder="Describe the problem, decision, or design question."
              className="min-h-[140px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ask-attachments">Attachments</Label>
            <Input
              id="ask-attachments"
              type="file"
              multiple
              accept={FILE_INPUT_ACCEPT}
              onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            />
            {selectedFiles.length > 0 ? (
              <ul className="space-y-1 text-sm text-[var(--text-dim)]">
                {selectedFiles.map((file) => (
                  <li key={file.name}>{file.name}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleSubmitQuestion}
              disabled={submitting || !query.trim() || !selectedCouncilRef}
              size="lg"
            >
              {submitting ? "Submitting…" : "Send to The Seven"}
            </Button>
            <span className="text-xs text-[var(--text-dim)]">
              ⌘↩ submits · drafts persist locally
            </span>
          </div>
        </div>
      </section>

      <SessionInspector
        authenticated={auth.isAuthenticated}
        authHeader={auth.authHeader}
        sessionId={activeSessionId}
        onSpawnedSession={(sessionId) => {
          setActiveSessionId(sessionId);
          writeActiveSessionId(sessionId);
        }}
      />
    </div>
  );
}
