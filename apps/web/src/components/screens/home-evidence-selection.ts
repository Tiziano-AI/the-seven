import {
  ATTACHMENT_FILE_EXTENSIONS,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_DECODED_BYTES,
  MAX_ATTACHMENT_FILENAME_CHARS,
} from "@the-seven/contracts";
import { formatFileSize } from "@/components/screens/home-screen-formatters";

export type EvidenceSelectionIssue = Readonly<{ fileName: string; message: string }>;
export type EvidenceSelectionResult = Readonly<{ files: File[]; issues: EvidenceSelectionIssue[] }>;

const ALLOWED_ATTACHMENT_EXTENSIONS: readonly string[] = ATTACHMENT_FILE_EXTENSIONS;

function attachmentExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return name.slice(dotIndex).toLowerCase();
}

/** Validates browser evidence selection before files are stored or base64-read. */
export function validateEvidenceSelection(
  currentFiles: readonly File[],
  incomingFiles: readonly File[],
): EvidenceSelectionResult {
  const files = [...currentFiles];
  const issues: EvidenceSelectionIssue[] = [];
  for (const file of incomingFiles) {
    const name = file.name.trim();
    if (!name) {
      issues.push({
        fileName: file.name || "Unnamed file",
        message: "Attachment name is required.",
      });
      continue;
    }
    if (name.length > MAX_ATTACHMENT_FILENAME_CHARS) {
      issues.push({
        fileName: name,
        message: `Attachment name must be at most ${MAX_ATTACHMENT_FILENAME_CHARS} characters.`,
      });
      continue;
    }
    const extension = attachmentExtension(name);
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension)) {
      issues.push({
        fileName: name,
        message: `Unsupported exhibit type. Use ${ATTACHMENT_FILE_EXTENSIONS.join(", ")}.`,
      });
      continue;
    }
    if (file.size > MAX_ATTACHMENT_DECODED_BYTES) {
      issues.push({
        fileName: name,
        message: `Exhibit exceeds ${formatFileSize(MAX_ATTACHMENT_DECODED_BYTES)} decoded bytes.`,
      });
      continue;
    }
    if (files.length >= MAX_ATTACHMENT_COUNT) {
      issues.push({
        fileName: name,
        message: `Only ${MAX_ATTACHMENT_COUNT} exhibits can be attached.`,
      });
      continue;
    }
    files.push(file);
  }
  return { files, issues };
}
