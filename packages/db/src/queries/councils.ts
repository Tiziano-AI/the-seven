import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { councilMembers, councils } from "../schema";

export type CouncilMemberAssignmentInput = Readonly<{
  memberPosition: number;
  provider: "openrouter";
  modelId: string;
  tuningJson: object | null;
}>;

function requireInsertedRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Insert failed for ${label}`);
  }
  return row;
}

export async function listUserCouncils(userId: number) {
  const db = await getDb();
  return db
    .select()
    .from(councils)
    .where(eq(councils.userId, userId))
    .orderBy(asc(councils.createdAt));
}

export async function getUserCouncilWithMembers(input: { userId: number; councilId: number }) {
  const db = await getDb();
  const councilRows = await db
    .select()
    .from(councils)
    .where(and(eq(councils.id, input.councilId), eq(councils.userId, input.userId)))
    .limit(1);

  const council = councilRows[0];
  if (!council) {
    return null;
  }

  const members = await db
    .select()
    .from(councilMembers)
    .where(eq(councilMembers.councilId, council.id))
    .orderBy(asc(councilMembers.memberPosition));

  return { council, members };
}

export async function createCouncil(input: {
  userId: number;
  name: string;
  phase1Prompt: string;
  phase2Prompt: string;
  phase3Prompt: string;
  members: ReadonlyArray<CouncilMemberAssignmentInput>;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const insertedCouncil = await tx
      .insert(councils)
      .values({
        userId: input.userId,
        name: input.name,
        phase1Prompt: input.phase1Prompt,
        phase2Prompt: input.phase2Prompt,
        phase3Prompt: input.phase3Prompt,
      })
      .returning({ id: councils.id });

    const councilId = requireInsertedRow(insertedCouncil, "councils").id;

    await tx.insert(councilMembers).values(
      input.members.map((member) => ({
        councilId,
        memberPosition: member.memberPosition,
        provider: member.provider,
        modelId: member.modelId,
        tuningJson: member.tuningJson,
      })),
    );

    return councilId;
  });
}

export async function updateCouncil(input: {
  userId: number;
  councilId: number;
  name: string;
  phase1Prompt: string;
  phase2Prompt: string;
  phase3Prompt: string;
  members: ReadonlyArray<CouncilMemberAssignmentInput>;
}) {
  const db = await getDb();
  await db.transaction(async (tx) => {
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
      })),
    );
  });
}

export async function deleteCouncil(input: { userId: number; councilId: number }) {
  const db = await getDb();
  await db
    .delete(councils)
    .where(and(eq(councils.id, input.councilId), eq(councils.userId, input.userId)));
}
