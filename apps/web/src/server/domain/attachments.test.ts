import {
  ATTACHMENT_PARSE_TIMEOUT_MS,
  MAX_ATTACHMENT_DECODED_BYTES,
  MAX_ATTACHMENT_EXTRACTED_CHARS,
  MAX_ATTACHMENT_FILENAME_CHARS,
} from "@the-seven/contracts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fileTypeMocks = vi.hoisted(() => ({
  fileTypeFromBuffer: vi.fn(),
}));
const officeParserMocks = vi.hoisted(() => ({
  parseOffice: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("file-type", () => fileTypeMocks);
vi.mock("officeparser", () => ({
  default: officeParserMocks,
}));

import { decodeAttachmentToText } from "./attachments";

function textUpload(name: string, text: string) {
  return {
    name,
    base64: Buffer.from(text, "utf8").toString("base64"),
  };
}

describe("decodeAttachmentToText", () => {
  beforeEach(() => {
    fileTypeMocks.fileTypeFromBuffer.mockReset();
    officeParserMocks.parseOffice.mockReset();
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("rejects invalid base64 deterministically", async () => {
    await expect(decodeAttachmentToText({ name: "brief.txt", base64: "%%%" })).resolves.toEqual({
      ok: false,
      error: {
        kind: "invalid_base64",
        message: "Attachment brief.txt is not valid base64",
      },
    });
  });

  test("rejects unsupported filename extensions before decoding", async () => {
    await expect(decodeAttachmentToText(textUpload("brief.exe", "hello"))).resolves.toEqual({
      ok: false,
      error: {
        kind: "unsupported_type",
        message:
          "Attachment brief.exe must use one of: .txt, .md, .markdown, .json, .yaml, .yml, .csv, .pdf, .docx, .pptx, .xlsx, .odt, .odp, .ods",
      },
    });
  });

  test("rejects oversized filenames", async () => {
    const name = `${"x".repeat(MAX_ATTACHMENT_FILENAME_CHARS + 1)}.txt`;

    const result = await decodeAttachmentToText(textUpload(name, "hello"));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_name",
        message: `Attachment name must be at most ${MAX_ATTACHMENT_FILENAME_CHARS} characters`,
      },
    });
  });

  test("rejects oversized decoded bytes", async () => {
    const payload = Buffer.alloc(MAX_ATTACHMENT_DECODED_BYTES + 1, 65).toString("base64");

    const result = await decodeAttachmentToText({ name: "large.txt", base64: payload });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "extraction_failed",
        message: `Attachment large.txt exceeds ${MAX_ATTACHMENT_DECODED_BYTES} decoded bytes.`,
      },
    });
  });

  test("rejects invalid UTF-8 text attachments", async () => {
    const invalidUtf8 = Buffer.from([0xff]).toString("base64");

    const result = await decodeAttachmentToText({ name: "bad.txt", base64: invalidUtf8 });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid_utf8",
        message: "Attachment bad.txt is not valid UTF-8 text",
      },
    });
  });

  test("rejects extracted text above the character cap", async () => {
    const result = await decodeAttachmentToText(
      textUpload("huge.txt", "x".repeat(MAX_ATTACHMENT_EXTRACTED_CHARS + 1)),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "extraction_failed",
        message: `Attachment huge.txt extracted text exceeds ${MAX_ATTACHMENT_EXTRACTED_CHARS} characters.`,
      },
    });
  });

  test("rejects document parser failures", async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: "application/pdf", ext: "pdf" });
    officeParserMocks.parseOffice.mockRejectedValue(new Error("parser exploded"));

    const result = await decodeAttachmentToText(textUpload("brief.pdf", "%PDF"));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "extraction_failed",
        message: "Failed to extract text from brief.pdf (application/pdf): parser exploded",
      },
    });
  });

  test("rejects documents with no extractable text", async () => {
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: "application/pdf", ext: "pdf" });
    officeParserMocks.parseOffice.mockResolvedValue({ toText: () => "   " });

    const result = await decodeAttachmentToText(textUpload("blank.pdf", "%PDF"));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "no_extractable_text",
        message:
          "Attachment blank.pdf (application/pdf) contains no extractable text (OCR is not supported).",
      },
    });
  });

  test("rejects document parser timeouts", async () => {
    vi.useFakeTimers();
    fileTypeMocks.fileTypeFromBuffer.mockResolvedValue({ mime: "application/pdf", ext: "pdf" });
    officeParserMocks.parseOffice.mockReturnValue(new Promise(() => {}));

    const resultPromise = decodeAttachmentToText(textUpload("brief.pdf", "%PDF"));
    await vi.advanceTimersByTimeAsync(ATTACHMENT_PARSE_TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: {
        kind: "extraction_failed",
        message: `Failed to extract text from brief.pdf (application/pdf): parser_timeout_${ATTACHMENT_PARSE_TIMEOUT_MS}ms`,
      },
    });
  });
});
