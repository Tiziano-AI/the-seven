import type { MemberPosition } from "@the-seven/contracts";

type SigilName = "book" | "quill" | "lantern" | "inkpot" | "scroll" | "dividers" | "sun";

const SIGIL_BY_POSITION: Record<MemberPosition, SigilName> = {
  1: "book",
  2: "quill",
  3: "lantern",
  4: "inkpot",
  5: "scroll",
  6: "dividers",
  7: "sun",
};

const PATHS: Record<SigilName, React.ReactNode> = {
  book: (
    <>
      <path d="M3 5.5 L12 7.5 L21 5.5 L21 17.5 L12 19.5 L3 17.5 Z" />
      <path d="M12 7.5 L12 19.5" />
    </>
  ),
  quill: (
    <>
      <path d="M4.5 20 L20 4.5" />
      <path d="M9 17 L5 18.5" />
      <path d="M11 15 L7 16.5" />
      <path d="M13 13 L9 14.5" />
      <path d="M15 11 L11 12.5" />
      <path d="M17 9 L13 10.5" />
    </>
  ),
  lantern: (
    <>
      <path d="M9 3 L15 3" />
      <path d="M12 3 L12 5.5" />
      <rect x="6.5" y="5.5" width="11" height="14" rx="1.2" />
      <circle cx="12" cy="12.5" r="1.5" />
    </>
  ),
  inkpot: <path d="M9 3.5 L15 3.5 L15 7 L18 7 L18 13.5 Q18 20 12 20 Q6 20 6 13.5 L6 7 L9 7 Z" />,
  scroll: (
    <>
      <ellipse cx="6" cy="12" rx="2" ry="6" />
      <path d="M6 6 L18 6" />
      <path d="M6 18 L18 18" />
      <ellipse cx="18" cy="12" rx="2" ry="6" />
    </>
  ),
  dividers: (
    <>
      <circle cx="12" cy="5" r="1.5" />
      <path d="M12 6.5 L6 19.5" />
      <path d="M12 6.5 L18 19.5" />
      <path d="M9.5 13 Q12 12 14.5 13" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5 L12 5" />
      <path d="M12 19 L12 21.5" />
      <path d="M2.5 12 L5 12" />
      <path d="M19 12 L21.5 12" />
      <path d="M5.4 5.4 L7 7" />
      <path d="M17 17 L18.6 18.6" />
      <path d="M5.4 18.6 L7 17" />
      <path d="M17 7 L18.6 5.4" />
    </>
  ),
};

export function Sigil(props: { position: MemberPosition; className?: string }) {
  const name = SIGIL_BY_POSITION[props.position];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={props.className}
    >
      {PATHS[name]}
    </svg>
  );
}
