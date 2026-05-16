import {
  isReviewerMemberPosition,
  type MemberPosition,
  memberForPosition,
} from "@the-seven/contracts";

/** Opens an evidence anchor after the proceedings panel has been made visible. */
export function scrollEvidenceTarget(input: {
  targetId: string;
  fallbackId?: string;
  openProceedings: () => void;
}) {
  if (input.targetId.startsWith("proceedings-") || input.fallbackId?.startsWith("proceedings-")) {
    input.openProceedings();
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target =
        window.document.getElementById(input.targetId) ??
        (input.fallbackId ? window.document.getElementById(input.fallbackId) : null);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

/** Opens proceedings and scrolls to the reviewer or synthesizer evidence for a council seat. */
export function scrollMemberEvidence(input: {
  position: MemberPosition;
  openProceedings: () => void;
}) {
  input.openProceedings();
  requestAnimationFrame(() => {
    const alias = memberForPosition(input.position).alias;
    const targetId = isReviewerMemberPosition(input.position)
      ? `proceedings-phase2-${alias}`
      : input.position === 7
        ? "verdict-G"
        : `proceedings-phase1-${alias}`;
    const fallbackId = `proceedings-phase1-${alias}`;
    const target =
      window.document.getElementById(targetId) ?? window.document.getElementById(fallbackId);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
