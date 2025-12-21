import { PasswordSetup } from "@/components/PasswordSetup";
import { UnlockSession } from "@/components/UnlockSession";
import { AppShell } from "@/components/AppShell";
import type { ChangeEvent } from "react";
import { ApiKeyEntryCard } from "./components/ApiKeyEntryCard";
import { QueryComposerCard } from "./components/QueryComposerCard";
import { RunSheet } from "@/features/sessions/components/RunSheet";
import { useSessionResults } from "@/features/sessions/hooks/useSessionResults";
import { useHomeAuth, type HomeAuthState } from "./hooks/useHomeAuth";
import { useQueryComposer } from "./hooks/useQueryComposer";

function AuthenticatedHome(props: { onLock: () => void; authState: HomeAuthState }) {
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

  if (auth.authState === "initial") {
    return (
      <AppShell layout="centered" showNav={false}>
        <div className="space-y-6 w-full max-w-md">
          <ApiKeyEntryCard
            apiKeyInput={auth.apiKeyInput}
            onApiKeyInputChange={auth.setApiKeyInput}
            isValidating={auth.isValidatingKey}
            onContinue={() => {
              void auth.validateApiKeyInput();
            }}
          />
        </div>
      </AppShell>
    );
  }

  if (auth.authState === "setup-password") {
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

  if (auth.authState === "unlock") {
    return (
      <AppShell layout="centered" showNav={false}>
        <div className="space-y-6 w-full max-w-md">
          <UnlockSession onUnlock={auth.unlock} onReset={auth.reset} />
        </div>
      </AppShell>
    );
  }

  return <AuthenticatedHome onLock={auth.lock} authState={auth.authState} />;
}
