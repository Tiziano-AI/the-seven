import {
  type CouncilDefinition,
  type CouncilPersistedDefinition,
  parseCouncilDefinition,
  parseCouncilPersistedDefinition,
} from "@the-seven/contracts";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { councils } from "../schema";

export type StoredCouncil = Readonly<{
  id: number;
  userId: number;
  definition: CouncilDefinition;
  createdAt: Date;
  updatedAt: Date;
}>;

function requireInsertedRow<T>(rows: ReadonlyArray<T>, label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Insert failed for ${label}`);
  }
  return row;
}

function toStoredCouncil(row: typeof councils.$inferSelect): StoredCouncil {
  const definition = parseCouncilPersistedDefinition(row.definitionJson);
  return {
    id: row.id,
    userId: row.userId,
    definition: parseCouncilDefinition({
      name: row.name,
      ...definition,
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPersistedDefinition(definition: CouncilDefinition): CouncilPersistedDefinition {
  return parseCouncilPersistedDefinition({
    phasePrompts: definition.phasePrompts,
    members: definition.members,
  });
}

export async function listUserCouncils(userId: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(councils)
    .where(eq(councils.userId, userId))
    .orderBy(asc(councils.createdAt));

  return rows.map(toStoredCouncil);
}

export async function getUserCouncil(input: { userId: number; councilId: number }) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(councils)
    .where(and(eq(councils.id, input.councilId), eq(councils.userId, input.userId)))
    .limit(1);

  const row = rows[0];
  return row ? toStoredCouncil(row) : null;
}

export async function createCouncil(input: { userId: number; definition: CouncilDefinition }) {
  const db = await getDb();
  const definition = parseCouncilDefinition(input.definition);

  const inserted = await db
    .insert(councils)
    .values({
      userId: input.userId,
      name: definition.name,
      definitionJson: toPersistedDefinition(definition),
    })
    .returning({ id: councils.id });

  return requireInsertedRow(inserted, "councils").id;
}

export async function replaceCouncil(input: {
  userId: number;
  councilId: number;
  definition: CouncilDefinition;
}) {
  const db = await getDb();
  const definition = parseCouncilDefinition(input.definition);

  const updated = await db
    .update(councils)
    .set({
      name: definition.name,
      definitionJson: toPersistedDefinition(definition),
      updatedAt: new Date(),
    })
    .where(and(eq(councils.id, input.councilId), eq(councils.userId, input.userId)))
    .returning({ id: councils.id });

  return updated.length > 0;
}

export async function deleteCouncil(input: { userId: number; councilId: number }) {
  const db = await getDb();
  const deleted = await db
    .delete(councils)
    .where(and(eq(councils.id, input.councilId), eq(councils.userId, input.userId)))
    .returning({ id: councils.id });

  return deleted.length > 0;
}
