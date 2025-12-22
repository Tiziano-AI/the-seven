import { z } from "zod";
import type { Attachment } from "../../domain/attachments";

const storedTextAttachmentsSchema = z.array(
  z.object({
    name: z.string(),
    text: z.string(),
  })
);

export function parseTextAttachmentsJson(value: string | null): Attachment[] {
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (_error: unknown) {
    throw new Error("Invalid attachments JSON");
  }

  return storedTextAttachmentsSchema.parse(parsed);
}
