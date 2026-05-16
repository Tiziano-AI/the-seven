export type CouncilRef =
  | Readonly<{ kind: "built_in"; slug: string }>
  | Readonly<{ kind: "user"; councilId: number }>;

type BuiltInCouncilSlug = "founding" | "lantern" | "commons";

const builtInCouncilFixtures: Readonly<
  Record<BuiltInCouncilSlug, Readonly<{ ref: CouncilRef; name: string; description: string }>>
> = {
  founding: {
    ref: { kind: "built_in", slug: "founding" },
    name: "The Founding Council",
    description: "The BYOK best-of-best roster. GPT-5.5 Pro delivers the verdict.",
  },
  lantern: {
    ref: { kind: "built_in", slug: "lantern" },
    name: "The Lantern Council",
    description: "Deliberate mid-tier bridge voices. Qwen3.6 Max Preview delivers the verdict.",
  },
  commons: {
    ref: { kind: "built_in", slug: "commons" },
    name: "The Commons Council",
    description: "Paid low-cost demo voices. MiniMax M2.7 delivers the verdict.",
  },
};

export function builtInCommonsRef(): CouncilRef {
  return builtInCouncilFixtures.commons.ref;
}

export function userCouncilRef(): CouncilRef {
  return { kind: "user", councilId: 901 };
}

export function encodeCouncilRef(ref: CouncilRef) {
  return ref.kind === "built_in" ? `built_in:${ref.slug}` : `user:${ref.councilId}`;
}

export function builtInCouncilByLocator(locator: string) {
  if (locator === encodeCouncilRef(builtInCouncilFixtures.founding.ref)) {
    return builtInCouncilFixtures.founding;
  }
  if (locator === encodeCouncilRef(builtInCouncilFixtures.lantern.ref)) {
    return builtInCouncilFixtures.lantern;
  }
  if (locator === encodeCouncilRef(builtInCouncilFixtures.commons.ref)) {
    return builtInCouncilFixtures.commons;
  }
  return null;
}

export function builtInCouncilListFixtures(input: { includeAllBuiltIns: boolean }) {
  if (!input.includeAllBuiltIns) {
    return [builtInCouncilFixtures.commons];
  }
  return [
    builtInCouncilFixtures.founding,
    builtInCouncilFixtures.lantern,
    builtInCouncilFixtures.commons,
  ];
}

function councilDescription(ref: CouncilRef, editable: boolean) {
  if (editable) {
    return "Custom council";
  }
  if (ref.kind === "built_in" && ref.slug === "founding") {
    return builtInCouncilFixtures.founding.description;
  }
  if (ref.kind === "built_in" && ref.slug === "lantern") {
    return builtInCouncilFixtures.lantern.description;
  }
  return builtInCouncilFixtures.commons.description;
}

export function councilListItem(ref: CouncilRef, name: string, editable: boolean) {
  return {
    ref,
    name,
    description: councilDescription(ref, editable),
    editable,
    deletable: editable,
  };
}
