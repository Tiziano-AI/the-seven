/**
 * Supported attachment file extensions for client-side file inputs.
 */
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

/**
 * Union of supported attachment file extensions.
 */
export type AttachmentFileExtension = (typeof ATTACHMENT_FILE_EXTENSIONS)[number];

/**
 * File input accept string for supported attachment extensions.
 */
export const FILE_INPUT_ACCEPT = ATTACHMENT_FILE_EXTENSIONS.join(",");
