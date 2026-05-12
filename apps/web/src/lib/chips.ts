type MdastTextNode = { type: "text"; value: string };
type MdastLinkNode = {
  type: "link";
  url: string;
  title?: string | null;
  children: MdastChild[];
};
type MdastChild = MdastTextNode | MdastLinkNode | { type: string; children?: MdastChild[] };
type MdastRoot = { type: "root"; children: MdastChild[] };

const CHIP_PATTERN = /\[([A-F]|R[1-6])\]/g;

function isParentNode(
  node: MdastChild | MdastRoot,
): node is MdastChild & { children: MdastChild[] } {
  return Array.isArray((node as { children?: unknown }).children);
}

function chipUrl(id: string) {
  return id.startsWith("R") ? `#rev-${id}` : `#cand-${id}`;
}

function chipTitle(id: string) {
  return id.startsWith("R") ? "reviewer-chip" : "candidate-chip";
}

function splitTextValue(value: string): MdastChild[] | null {
  CHIP_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = CHIP_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const out: MdastChild[] = [];
  let cursor = 0;
  while (match !== null) {
    if (match.index > cursor) {
      out.push({ type: "text", value: value.slice(cursor, match.index) });
    }
    const id = match[1];
    out.push({
      type: "link",
      url: chipUrl(id),
      title: chipTitle(id),
      children: [{ type: "text", value: id }],
    });
    cursor = CHIP_PATTERN.lastIndex;
    match = CHIP_PATTERN.exec(value);
  }
  if (cursor < value.length) {
    out.push({ type: "text", value: value.slice(cursor) });
  }
  return out;
}

function transform(node: MdastChild | MdastRoot): void {
  if (!isParentNode(node) && (node as MdastChild).type !== "root") {
    return;
  }
  const parent = node as { children: MdastChild[] };
  const next: MdastChild[] = [];
  for (const child of parent.children) {
    if (child.type === "text" && "value" in child) {
      const replacement = splitTextValue((child as MdastTextNode).value);
      if (replacement) {
        next.push(...replacement);
        continue;
      }
    }
    transform(child);
    next.push(child);
  }
  parent.children = next;
}

export function remarkChips() {
  return (tree: MdastRoot) => {
    transform(tree);
  };
}

export type ChipKind = "candidate" | "reviewer";

export function chipKindFromUrl(url: string | undefined): ChipKind | null {
  if (!url) return null;
  if (url.startsWith("#cand-")) return "candidate";
  if (url.startsWith("#rev-")) return "reviewer";
  return null;
}

export function chipIdFromUrl(url: string): string | null {
  if (url.startsWith("#cand-")) return url.slice("#cand-".length);
  if (url.startsWith("#rev-")) return url.slice("#rev-".length);
  return null;
}
