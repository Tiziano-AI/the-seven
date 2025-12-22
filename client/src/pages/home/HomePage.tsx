import { PasswordSetup } from "@/components/PasswordSetup";
import { UnlockSession } from "@/components/UnlockSession";
import { AppShell } from "@/components/AppShell";
import { useEffect, type ChangeEvent } from "react";
import { ApiKeyEntryCard } from "./components/ApiKeyEntryCard";
import { DemoEntryCard } from "./components/DemoEntryCard";
import { QueryComposerCard } from "./components/QueryComposerCard";
import { RunSheet } from "@/features/sessions/components/RunSheet";
import { useSessionResults } from "@/features/sessions/hooks/useSessionResults";
import { useHomeAuth, type HomeAuthState } from "./hooks/useHomeAuth";
import { useDemoAuth } from "./hooks/useDemoAuth";
import { useQueryComposer } from "./hooks/useQueryComposer";
import { useAuth } from "@/contexts/AuthContext";

function AuthenticatedHome(props: { onLock?: () => void; authState: HomeAuthState }) {
  const queryComposer = useQueryComposer();

  const sessionQuery = useSessionResults({
    sessionId: queryComposer.currentSessionId,
    polling: "untilTerminal",
    intervalMs: 2000,
  });

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    queryComposer.onFileInputChange(event.target.files);
  };

  return (
    <AppShell onLock={props.onLock}>
      <div className="content-center space-y-6">
        <div>
          <h1>Ask</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Bring a question. The council replies, critiques, and delivers a verdict.
          </p>
        </div>

        <QueryComposerCard
          councils={queryComposer.councils}
          councilValue={queryComposer.councilValue}
          onCouncilChange={queryComposer.setCouncilValue}
          isCouncilsLoading={queryComposer.isCouncilsLoading}
          councilsError={queryComposer.councilsError}
          onRetryCouncils={queryComposer.refetchCouncils}
          query={queryComposer.query}
          onQueryChange={queryComposer.setQuery}
          files={queryComposer.files}
          fileInputAccept={queryComposer.fileInputAccept}
          isSubmitting={queryComposer.isSubmitting}
          onFileChange={onFileChange}
          onRemoveFile={queryComposer.removeFile}
          onSubmit={() => {
            void queryComposer.submit();
          }}
        />

        {queryComposer.currentSessionId !== null && (
          <RunSheet
            sessionId={queryComposer.currentSessionId}
            isLoading={sessionQuery.isLoading}
            data={sessionQuery.data}
            context="active"
            onDismiss={queryComposer.clearActiveSession}
            onRefetch={sessionQuery.refetch}
          />
        )}
      </div>
    </AppShell>
  );
}

/**
 * HomePage renders the Ask surface and key onboarding cards.
 */
export default function HomePage() {
  const auth = useHomeAuth();
  const demo = useDemoAuth();
  const { isAuthenticated, mode } = useAuth();
  const onLock = mode === "byok" ? auth.lock : undefined;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("demo_token");
    if (!token) return;
    void demo.consumeToken(token);
    params.delete("demo_token");
    const next = params.toString();
    const url = next ? `/?${next}` : "/";
    window.history.replaceState({}, "", url);
  }, [demo]);

  if (!isAuthenticated && auth.authState === "initial") {
    return (
      <AppShell layout="centered" showNav={false}>
        <div className="space-y-6 w-full max-w-2xl">
          <div className="grid gap-6 md:grid-cols-2">
            <DemoEntryCard
              state={demo.state}
              emailInput={demo.emailInput}
              onEmailInputChange={demo.setEmailInput}
              isRequesting={demo.isRequesting}
              onRequest={demo.requestLink}
              onReset={demo.resetRequest}
            />
            <ApiKeyEntryCard
              apiKeyInput={auth.apiKeyInput}
              onApiKeyInputChange={auth.setApiKeyInput}
              isValidating={auth.isValidatingKey}
              onContinue={() => {
                void auth.validateApiKeyInput();
              }}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated && auth.authState === "setup-password") {
    return (
      <AppShell layout="centered" showNav={false}>
        <div className="space-y-6 w-full max-w-md">
          <PasswordSetup
            apiKey={auth.apiKeyForPasswordSetup}
            onComplete={auth.completePasswordSetup}
          />
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated && auth.authState === "unlock") {
    return (
      <AppShell layout="centered" showNav={false}>
        <div className="space-y-6 w-full max-w-2xl">
          <div className="grid gap-6 md:grid-cols-2">
            <UnlockSession onUnlock={auth.unlock} onReset={auth.reset} />
            <DemoEntryCard
              state={demo.state}
              emailInput={demo.emailInput}
              onEmailInputChange={demo.setEmailInput}
              isRequesting={demo.isRequesting}
              onRequest={demo.requestLink}
              onReset={demo.resetRequest}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  return <AuthenticatedHome onLock={onLock} authState={auth.authState} />;
}
