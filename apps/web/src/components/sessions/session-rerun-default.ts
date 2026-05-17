import { type CouncilRef, encodeCouncilRef } from "@the-seven/contracts";

type AvailableCouncil = Readonly<{
  ref: CouncilRef;
  name: string;
}>;

type SelectOriginalCouncilInput = Readonly<{
  availableCouncils: ReadonlyArray<AvailableCouncil>;
  councilNameAtRun: string;
  refAtRun?: CouncilRef;
}>;

/** Selects the original run council only when the available council can be identified safely. */
export function selectOriginalCouncilRef(input: SelectOriginalCouncilInput) {
  if (input.refAtRun) {
    const encoded = encodeCouncilRef(input.refAtRun);
    if (input.availableCouncils.some((council) => encodeCouncilRef(council.ref) === encoded)) {
      return encoded;
    }
  }

  const nameMatches = input.availableCouncils.filter(
    (council) => council.name === input.councilNameAtRun,
  );
  return nameMatches.length === 1 ? encodeCouncilRef(nameMatches[0].ref) : "";
}
