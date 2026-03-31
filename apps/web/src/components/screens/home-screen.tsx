"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import { SessionInspector } from "@/components/sessions/session-inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  consumeDemoLink,
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

type HomeScreenProps = {
  initialDemoToken: string | null;
};

export function HomeScreen({ initialDemoToken }: HomeScreenProps) {
  const auth = useAuth();
  const [hasStoredByok, setHasStoredByok] = useState(false);
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
    setHasStoredByok(hasEncryptedKey());
    setQuery(readDraftQuery());
    setActiveSessionId(readActiveSessionId());
  }, []);

  useEffect(() => {
    writeDraftQuery(query);
  }, [query]);

  useEffect(() => {
    if (!auth.authHeader) {
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
  }, [auth.authHeader]);

  useEffect(() => {
    if (selectedCouncil) {
      writeLastCouncilRef(selectedCouncil);
    }
  }, [selectedCouncil]);

  useEffect(() => {
    if (!initialDemoToken || auth.isAuthenticated) {
      return;
    }

    void consumeDemoLink(initialDemoToken)
      .then((session) => {
        auth.setDemoSession(session);
        toast.success(`Demo unlocked for ${session.email}`);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Demo unlock failed");
      });
  }, [auth, auth.isAuthenticated, initialDemoToken]);

  const selectedCouncilRef = useMemo(() => {
    return readCouncilRef(selectedCouncil);
  }, [selectedCouncil]);

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
    if (!auth.authHeader || !selectedCouncilRef) {
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
      <div className="mx-auto max-w-xl">
        <Card className="p-6">
          <div className="space-y-5">
            <div>
              <Badge>Bring Your Own Key</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
                Unlock a private council workspace.
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
                Your OpenRouter key is encrypted locally in this browser. The server only sees the
                plaintext transiently per request and stores durable worker credentials as encrypted
                job blobs.
              </p>
            </div>
            <div className="space-y-3">
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
                  <Button onClick={handleUnlockStoredKey} disabled={!password}>
                    Unlock Stored Key
                  </Button>
                  <button
                    type="button"
                    className="block text-sm text-[var(--text-dim)] underline hover:text-[var(--gold)]"
                    onClick={() => {
                      auth.resetEncryptedKey();
                      setHasStoredByok(false);
                    }}
                  >
                    Use a Different Key
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-[var(--text-dim)]">
              <div className="h-px flex-1 bg-[var(--border)]" />
              or try the demo
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <div className="space-y-3">
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                The demo flow sends a magic link, issues a 24-hour session, and locks the product to
                the Commons Council.
              </p>
              <div className="space-y-2">
                <Label htmlFor="demo-email">Email</Label>
                <Input
                  id="demo-email"
                  type="email"
                  value={demoEmail}
                  onChange={(event) => setDemoEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button variant="secondary" onClick={handleRequestDemo} disabled={!demoEmail}>
                Send Magic Link
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <Badge>{auth.mode === "demo" ? "Demo Ask Surface" : "Ask Surface"}</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Ask the council.</h1>
        <div className="mt-5 grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="ask-council">Council</Label>
            <Input
              id="ask-council"
              list="ask-council-options"
              value={selectedCouncil}
              onChange={(event) => setSelectedCouncil(event.target.value)}
            />
            <datalist id="ask-council-options">
              {availableCouncils.map((council) => (
                <option
                  key={council.name}
                  value={
                    council.ref.kind === "built_in"
                      ? `built_in:${council.ref.slug}`
                      : `user:${council.ref.councilId}`
                  }
                >
                  {council.name}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ask-question">Question</Label>
            <Textarea
              id="ask-question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Describe the problem, decision, or design question."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ask-attachments">Attachments</Label>
            <Input
              id="ask-attachments"
              type="file"
              multiple
              accept=".txt,.md,.markdown,.json,.yaml,.yml,.csv,.pdf,.docx,.pptx,.xlsx,.odt,.odp,.ods"
              onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            />
            {selectedFiles.length > 0 ? (
              <ul className="space-y-1 text-sm text-[var(--muted-foreground)]">
                {selectedFiles.map((file) => (
                  <li key={file.name}>{file.name}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <Button
            onClick={handleSubmitQuestion}
            disabled={submitting || !query.trim() || !selectedCouncilRef}
          >
            {submitting ? "Submitting…" : "Send to The Seven"}
          </Button>
        </div>
      </Card>

      <SessionInspector
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
