import { z } from "zod";

export const ATTACHMENT_FILE_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".odt",
  ".odp",
  ".ods",
] as const;

export const FILE_INPUT_ACCEPT = ATTACHMENT_FILE_EXTENSIONS.join(",");

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_FILENAME_CHARS = 160;
export const MAX_ATTACHMENT_DECODED_BYTES = 2 * 1024 * 1024;
export const MAX_ATTACHMENT_EXTRACTED_CHARS = 120_000;
export const ATTACHMENT_PARSE_TIMEOUT_MS = 15_000;

export const attachmentUploadSchema = z.object({
  name: z.string().trim().min(1).max(MAX_ATTACHMENT_FILENAME_CHARS),
  base64: z.string().trim().min(1),
});

export const attachmentTextSchema = z.object({
  name: z.string().trim().min(1),
  text: z.string(),
});

export type AttachmentUpload = z.infer<typeof attachmentUploadSchema>;
export type AttachmentText = z.infer<typeof attachmentTextSchema>;
