import type { InspectorArtifact } from "@/components/inspector/council-track";

type SessionArtifactForTrack = Readonly<{
  id: number;
  phase: number;
  memberPosition: number;
  member: Readonly<{ label: string }>;
  modelId: string;
  modelName: string | null;
  content: string;
}>;

/** Maps session artifacts into the compact council-track view contract. */
export function buildInspectorArtifacts(
  artifacts: readonly SessionArtifactForTrack[],
): InspectorArtifact[] {
  return artifacts.map((artifact) => ({
    id: artifact.id,
    phase: artifact.phase,
    memberPosition: artifact.memberPosition,
    member: { label: artifact.member.label },
    modelId: artifact.modelId,
    modelName: artifact.modelName ?? artifact.modelId,
    content: artifact.content,
  }));
}
