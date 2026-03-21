import { SessionDetailScreen } from "@/components/screens/session-detail-screen";

export default async function SessionDetailPage(props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const sessionId = Number.parseInt(params.sessionId, 10);

  return Number.isFinite(sessionId) ? (
    <SessionDetailScreen sessionId={sessionId} />
  ) : (
    <main>Invalid session</main>
  );
}
