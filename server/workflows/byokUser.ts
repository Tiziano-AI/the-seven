import type { User } from "../../drizzle/schema";
import { deriveByokIdFromApiKey } from "../_core/byok";
import { getOrCreateUserByokId as getOrCreateUserByokIdFromStore } from "../stores/userStore";

/**
 * BYOK user context derived from an API key.
 */
export type ByokUserContext = Readonly<{ byokId: string; user: User }>;

/**
 * Derives a BYOK identity from the provided API key and ensures the user exists.
 */
export async function getOrCreateByokUserContext(apiKey: string): Promise<ByokUserContext> {
  const byokId = deriveByokIdFromApiKey(apiKey);
  const user = await getOrCreateUserByokIdFromStore(byokId);
  if (user.kind !== "byok") {
    throw new Error("BYOK identity mapped to non-BYOK user");
  }
  return { byokId, user };
}
