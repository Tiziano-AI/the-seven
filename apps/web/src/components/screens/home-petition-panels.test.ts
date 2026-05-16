import {
  ATTACHMENT_FILE_EXTENSIONS,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_DECODED_BYTES,
  MAX_ATTACHMENT_FILENAME_CHARS,
} from "@the-seven/contracts";
import { describe, expect, test } from "vitest";
import { validateEvidenceSelection } from "./home-evidence-selection";

function file(name: string, size: number): File {
  return new File([new Uint8Array(size)], name);
}

describe("validateEvidenceSelection", () => {
  test("keeps valid paid evidence files before browser base64 reads", () => {
    const result = validateEvidenceSelection([], [file("brief.txt", 12), file("ledger.JSON", 24)]);

    expect(result.issues).toEqual([]);
    expect(result.files.map((entry) => entry.name)).toEqual(["brief.txt", "ledger.JSON"]);
  });

  test("rejects count, extension, filename, and byte-limit violations", () => {
    const currentFiles = Array.from({ length: MAX_ATTACHMENT_COUNT - 1 }, (_, index) =>
      file(`existing-${index}.md`, 1),
    );
    const result = validateEvidenceSelection(currentFiles, [
      file("accepted.csv", 1),
      file("extra.txt", 1),
      file("script.exe", 1),
      file(`${"x".repeat(MAX_ATTACHMENT_FILENAME_CHARS + 1)}.txt`, 1),
      file("large.md", MAX_ATTACHMENT_DECODED_BYTES + 1),
    ]);

    expect(result.files).toHaveLength(MAX_ATTACHMENT_COUNT);
    expect(result.files.at(-1)?.name).toBe("accepted.csv");
    expect(result.issues.map((issue) => issue.message)).toEqual([
      `Only ${MAX_ATTACHMENT_COUNT} exhibits can be attached.`,
      `Unsupported exhibit type. Use ${ATTACHMENT_FILE_EXTENSIONS.join(", ")}.`,
      `Attachment name must be at most ${MAX_ATTACHMENT_FILENAME_CHARS} characters.`,
      `Exhibit exceeds ${(MAX_ATTACHMENT_DECODED_BYTES / (1024 * 1024)).toFixed(1)} MB decoded bytes.`,
    ]);
  });

  test("reports unsupported extension before count is exhausted", () => {
    const result = validateEvidenceSelection([], [file("payload.exe", 1)]);

    expect(result.files).toEqual([]);
    expect(result.issues[0]?.message).toContain(ATTACHMENT_FILE_EXTENSIONS.join(", "));
  });
});
