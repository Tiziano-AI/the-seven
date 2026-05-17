import Link from "next/link";
import { DemoEndConfirmation } from "@/components/app/demo-end-confirmation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CouncilLockedNoticeProps = Readonly<{
  message: string;
}>;

type CouncilDemoNoticeProps = Readonly<{
  demoByokConfirmOpen: boolean;
  demoByokEnding: boolean;
  demoByokError: string | null;
  onCancelDemoEnd: () => void;
  onConfirmDemoEnd: () => void;
  onOpenDemoEnd: () => void;
}>;

/** Renders the plain-language locked state for council management. */
export function CouncilLockedNotice(props: CouncilLockedNoticeProps) {
  return (
    <div>
      <h1 className="sr-only">Manage councils</h1>
      <Card className="p-6">
        <p className="text-sm text-[var(--text-muted)]">{props.message}</p>
        <Link className="btn btn-secondary btn-size-sm mt-4" href="/">
          Back to Ask
        </Link>
      </Card>
    </div>
  );
}

/** Renders the demo-only council-management explanation and BYOK transition. */
export function CouncilDemoNotice(props: CouncilDemoNoticeProps) {
  return (
    <div>
      <h1 className="sr-only">Manage councils</h1>
      <Card className="p-6 space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          Demo mode is locked to the Commons Council. Council editing is available only when you use
          your OpenRouter key.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-ghost btn-size-sm" href="/">
            Back to Ask
          </Link>
          <Button variant="secondary" onClick={props.onOpenDemoEnd}>
            End demo and use your key
          </Button>
        </div>
        {props.demoByokConfirmOpen ? (
          <DemoEndConfirmation
            title="End demo session and use your key?"
            body="The server ends the demo session before the browser cookie is cleared. Your OpenRouter key can be used after the demo session closes."
            confirmLabel="End demo and use your key"
            pendingLabel="Ending demo…"
            pending={props.demoByokEnding}
            error={props.demoByokError}
            onCancel={props.onCancelDemoEnd}
            onConfirm={props.onConfirmDemoEnd}
          />
        ) : null}
      </Card>
    </div>
  );
}
