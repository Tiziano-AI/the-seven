import { fileTypeFromBuffer } from "file-type";
import officeParser from "officeparser";

export type Attachment = Readonly<{
  name: string;
  text: string;
}>;

export type AttachmentInput = Readonly<{
  name: string;
  base64: string;
}>;

export type DecodeAttachmentError =
  | Readonly<{ kind: "invalid_name"; message: string }>
  | Readonly<{ kind: "invalid_base64"; message: string }>
  | Readonly<{ kind: "invalid_utf8"; message: string }>
  | Readonly<{ kind: "unsupported_type"; message: string }>
  | Readonly<{ kind: "extraction_failed"; message: string }>
  | Readonly<{ kind: "no_extractable_text"; message: string }>;

export type DecodeAttachmentResult =
  | Readonly<{ ok: true; attachment: Attachment }>
  | Readonly<{ ok: false; error: DecodeAttachmentError }>;

function hasOnlyBase64Chars(value: string): boolean {
  return /^[A-Za-z0-9+/=]*$/.test(value);
}

function normalizeBase64ForDecode(value: string): Readonly<{ ok: true; normalized: string } | { ok: false }> {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false };
  if (!hasOnlyBase64Chars(trimmed)) return { ok: false };

  const withoutPadding = trimmed.replace(/=+$/g, "");
  if (withoutPadding.includes("=")) return { ok: false };
  if (withoutPadding.length % 4 === 1) return { ok: false };

  const padLen = (4 - (withoutPadding.length % 4)) % 4;
  return { ok: true, normalized: withoutPadding + "=".repeat(padLen) };
}

function decodeBase64Strict(value: string): Readonly<{ ok: true; buffer: Buffer } | { ok: false }> {
  const normalized = normalizeBase64ForDecode(value);
  if (!normalized.ok) return { ok: false };

  const buffer = Buffer.from(normalized.normalized, "base64");
  const canonical = buffer.toString("base64").replace(/=+$/g, "");
  const expected = normalized.normalized.replace(/=+$/g, "");
  if (canonical !== expected) return { ok: false };

  return { ok: true, buffer };
}

function decodeUtf8Strict(buffer: Buffer): Readonly<{ ok: true; text: string } | { ok: false }> {
  try {
    // Node supports WHATWG TextDecoder with fatal decoding.
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return { ok: true, text: decoder.decode(buffer) };
  } catch {
    return { ok: false };
  }
}

const DOCUMENT_MIMES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.oasis.opendocument.text", // .odt
  "application/vnd.oasis.opendocument.presentation", // .odp
  "application/vnd.oasis.opendocument.spreadsheet", // .ods
]);

function normalizeNewlines(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

async function convertDocumentToText(params: { name: string; buffer: Buffer; mime: string }): Promise<DecodeAttachmentResult> {
  try {
    const extracted = await officeParser.parseOfficeAsync(params.buffer);
    const normalized = normalizeNewlines(extracted);
    if (normalized.trim().length === 0) {
      return {
        ok: false,
        error: {
          kind: "no_extractable_text",
          message: `Attachment ${params.name} (${params.mime}) contains no extractable text (OCR is not supported).`,
        },
      };
    }
    return { ok: true, attachment: { name: params.name, text: normalized } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Document extraction failed";
    return {
      ok: false,
      error: {
        kind: "extraction_failed",
        message: `Failed to extract text from ${params.name} (${params.mime}): ${message}`,
      },
    };
  }
}

export async function decodeAttachmentToText(input: AttachmentInput): Promise<DecodeAttachmentResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: { kind: "invalid_name", message: "Attachment name must not be blank" } };
  }

  if (/[\r\n]/.test(name)) {
    return {
      ok: false,
      error: { kind: "invalid_name", message: "Attachment name must be single-line" },
    };
  }

  const base64Decoded = decodeBase64Strict(input.base64);
  if (!base64Decoded.ok) {
    return { ok: false, error: { kind: "invalid_base64", message: `Attachment ${name} is not valid base64` } };
  }

  const detected = await (async () => {
    try {
      return await fileTypeFromBuffer(base64Decoded.buffer);
    } catch {
      return undefined;
    }
  })();
  if (detected && DOCUMENT_MIMES.has(detected.mime)) {
    return await convertDocumentToText({ name, buffer: base64Decoded.buffer, mime: detected.mime });
  }

  const decodedText = decodeUtf8Strict(base64Decoded.buffer);
  if (!decodedText.ok) {
    if (detected) {
      return {
        ok: false,
        error: {
          kind: "unsupported_type",
          message: `Attachment ${name} is ${detected.mime} (${detected.ext}), which is not a supported format.`,
        },
      };
    }
    return {
      ok: false,
      error: { kind: "invalid_utf8", message: `Attachment ${name} is not valid UTF-8 text` },
    };
  }

  return { ok: true, attachment: { name, text: normalizeNewlines(decodedText.text) } };
}
