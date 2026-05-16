import Link from "next/link";
import { SessionDetailScreen } from "@/components/screens/session-detail-screen";
import { Card } from "@/components/ui/card";

function parseSessionIdParam(value: string): number | null {
  if (!/^[1-9]\d*$/u.test(value)) {
    return null;
  }
  const sessionId = Number(value);
  return Number.isSafeInteger(sessionId) ? sessionId : null;
}

function InvalidManuscriptScreen() {
  return (
    <div>
      <h1 className="sr-only">Manuscript</h1>
      <Card className="p-6">
        <p className="m-0 text-xs uppercase tracking-[0.18em] text-[var(--brass-soft)]">
          Archive recovery
        </p>
        <h2 className="mt-2 font-serif text-2xl text-[var(--text)]">Manuscript not found</h2>
        <p className="m-0 mt-2 text-sm text-[var(--text-muted)]">
          This manuscript address is not a positive archive number. Open the Archive ledger or file
          a new matter at the Petition Desk.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-secondary btn-size-sm" href="/sessions">
            Open Archive
          </Link>
          <Link className="btn btn-ghost btn-size-sm" href="/">
            Petition Desk
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default async function SessionDetailPage(props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const sessionId = parseSessionIdParam(params.sessionId);

  return sessionId ? <SessionDetailScreen sessionId={sessionId} /> : <InvalidManuscriptScreen />;
}
