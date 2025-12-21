import { and, asc, eq } from "drizzle-orm";
import { councilMembers, councils, type Council, type CouncilMember } from "../../drizzle/schema";
import { getDb } from "./dbClient";

/**
 * Input for creating a council with its member assignments.
 */
export type CouncilCreateInput = Readonly<{
  userId: number;
  name: string;
  phase1Prompt: string;
  phase2Prompt: string;
  phase3Prompt: string;
  members: ReadonlyArray<CouncilMemberAssignmentInput>;
}>;

/**
 * Input for updating a council and replacing its members atomically.
 */
export type CouncilUpdateInput = Readonly<{
  userId: number;
  councilId: number;
  name: string;
  phase1Prompt: string;
  phase2Prompt: string;
  phase3Prompt: string;
  members: ReadonlyArray<CouncilMemberAssignmentInput>;
}>;

/**
 * Canonical member assignment payload for council persistence.
 */
export type CouncilMemberAssignmentInput = Readonly<{
  memberPosition: number;
  provider: "openrouter";
  modelId: string;
  tuningJson: string | null;
}>;

/**
 * Council payload with its member assignments.
 */
export type CouncilWithMembers = Readonly<{
  council: Council;
  members: ReadonlyArray<CouncilMember>;
}>;

/**
 * Lists all councils for a user.
 */
export async function getCouncilsByUserId(userId: number): Promise<Council[]> {
  const db = await getDb();
  return await db.select().from(councils).where(eq(councils.userId, userId)).orderBy(asc(councils.createdAt));
}

/**
 * Loads a council and its members for a user.
 */
export async function getCouncilWithMembers(params: {
  userId: number;
  councilId: number;
}): Promise<CouncilWithMembers | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(councils)
    .where(and(eq(councils.id, params.councilId), eq(councils.userId, params.userId)))
    .limit(1);

  const council = rows[0];
  if (!council) return null;

  const members = await db
    .select()
    .from(councilMembers)
    .where(eq(councilMembers.councilId, params.councilId))
    .orderBy(asc(councilMembers.memberPosition));

  return { council, members };
}

/**
 * Creates a council and its members and returns the new council id.
 */
export async function createCouncil(input: CouncilCreateInput): Promise<number> {
  const db = await getDb();

  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(councils)
      .values({
        userId: input.userId,
        name: input.name,
        phase1Prompt: input.phase1Prompt,
        phase2Prompt: input.phase2Prompt,
        phase3Prompt: input.phase3Prompt,
      })
      .returning({ id: councils.id });

    const councilId = inserted[0]?.id;
    if (!councilId) {
      throw new Error("Failed to insert council");
    }

    await tx.insert(councilMembers).values(
      input.members.map((member) => ({
        councilId,
        memberPosition: member.memberPosition,
        provider: member.provider,
        modelId: member.modelId,
        tuningJson: member.tuningJson,
      }))
    );

    return councilId;
  });
}

/**
 * Updates a council and replaces its members atomically.
 */
export async function updateCouncil(input: CouncilUpdateInput): Promise<void> {
  const db = await getDb();

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: councils.id })
      .from(councils)
      .where(and(eq(councils.id, input.councilId), eq(councils.userId, input.userId)))
      .limit(1);

    if (existing.length === 0) {
      throw new Error("Council not found");
    }

    await tx
      .update(councils)
      .set({
        name: input.name,
        phase1Prompt: input.phase1Prompt,
        phase2Prompt: input.phase2Prompt,
        phase3Prompt: input.phase3Prompt,
        updatedAt: new Date(),
      })
      .where(and(eq(councils.id, input.councilId), eq(councils.userId, input.userId)));

    await tx.delete(councilMembers).where(eq(councilMembers.councilId, input.councilId));

    await tx.insert(councilMembers).values(
      input.members.map((member) => ({
        councilId: input.councilId,
        memberPosition: member.memberPosition,
        provider: member.provider,
        modelId: member.modelId,
        tuningJson: member.tuningJson,
      }))
    );
  });
}

/**
 * Deletes a council owned by the given user.
 */
export async function deleteCouncil(params: { userId: number; councilId: number }): Promise<void> {
  const db = await getDb();
  await db
    .delete(councils)
    .where(and(eq(councils.id, params.councilId), eq(councils.userId, params.userId)));
}
