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

export const attachmentUploadSchema = z.object({
  name: z.string().trim().min(1),
  base64: z.string().trim().min(1),
});

export const attachmentTextSchema = z.object({
  name: z.string().trim().min(1),
  text: z.string(),
});

export type AttachmentUpload = z.infer<typeof attachmentUploadSchema>;
export type AttachmentText = z.infer<typeof attachmentTextSchema>;
