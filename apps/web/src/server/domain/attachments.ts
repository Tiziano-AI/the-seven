import "server-only";

import type { AttachmentText, AttachmentUpload } from "@the-seven/contracts";
import { fileTypeFromBuffer } from "file-type";
import officeParser from "officeparser";

export type DecodeAttachmentError =
  | Readonly<{ kind: "invalid_name"; message: string }>
  | Readonly<{ kind: "invalid_base64"; message: string }>
  | Readonly<{ kind: "invalid_utf8"; message: string }>
  | Readonly<{ kind: "unsupported_type"; message: string }>
  | Readonly<{ kind: "extraction_failed"; message: string }>
  | Readonly<{ kind: "no_extractable_text"; message: string }>;

export type DecodeAttachmentResult =
  | Readonly<{ ok: true; attachment: AttachmentText }>
  | Readonly<{ ok: false; error: DecodeAttachmentError }>;

const DOCUMENT_MIMES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

function hasOnlyBase64Chars(value: string): boolean {
  return /^[A-Za-z0-9+/=]*$/.test(value);
}

function normalizeBase64ForDecode(
  value: string,
): Readonly<{ ok: true; normalized: string } | { ok: false }> {
  const trimmed = value.trim();
  if (!trimmed || !hasOnlyBase64Chars(trimmed)) {
    return { ok: false };
  }

  const withoutPadding = trimmed.replace(/=+$/g, "");
  if (withoutPadding.includes("=") || withoutPadding.length % 4 === 1) {
    return { ok: false };
  }

  const padLength = (4 - (withoutPadding.length % 4)) % 4;
  return { ok: true, normalized: withoutPadding + "=".repeat(padLength) };
}

function decodeBase64Strict(value: string): Readonly<{ ok: true; buffer: Buffer } | { ok: false }> {
  const normalized = normalizeBase64ForDecode(value);
  if (!normalized.ok) {
    return { ok: false };
  }

  const buffer = Buffer.from(normalized.normalized, "base64");
  const canonical = buffer.toString("base64").replace(/=+$/g, "");
  const expected = normalized.normalized.replace(/=+$/g, "");

  return canonical === expected ? { ok: true, buffer } : { ok: false };
}

function decodeUtf8Strict(buffer: Buffer): Readonly<{ ok: true; text: string } | { ok: false }> {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return { ok: true, text: decoder.decode(buffer) };
  } catch {
    return { ok: false };
  }
}

function normalizeNewlines(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

async function convertDocumentToText(input: {
  name: string;
  mime: string;
  buffer: Buffer;
}): Promise<DecodeAttachmentResult> {
  try {
    const extracted = await officeParser.parseOffice(input.buffer);
    const text = normalizeNewlines(extracted.toText());
    if (!text.trim()) {
      return {
        ok: false,
        error: {
          kind: "no_extractable_text",
          message: `Attachment ${input.name} (${input.mime}) contains no extractable text (OCR is not supported).`,
        },
      };
    }

    return {
      ok: true,
      attachment: {
        name: input.name,
        text,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document extraction failed";
    return {
      ok: false,
      error: {
        kind: "extraction_failed",
        message: `Failed to extract text from ${input.name} (${input.mime}): ${message}`,
      },
    };
  }
}

export async function decodeAttachmentToText(
  input: AttachmentUpload,
): Promise<DecodeAttachmentResult> {
  const name = input.name.trim();
  if (!name) {
    return {
      ok: false,
      error: { kind: "invalid_name", message: "Attachment name must not be blank" },
    };
  }

  if (/[\r\n]/.test(name)) {
    return {
      ok: false,
      error: { kind: "invalid_name", message: "Attachment name must be single-line" },
    };
  }

  const base64Decoded = decodeBase64Strict(input.base64);
  if (!base64Decoded.ok) {
    return {
      ok: false,
      error: { kind: "invalid_base64", message: `Attachment ${name} is not valid base64` },
    };
  }

  const detected = await (async () => {
    try {
      return await fileTypeFromBuffer(base64Decoded.buffer);
    } catch {
      return undefined;
    }
  })();

  if (detected && DOCUMENT_MIMES.has(detected.mime)) {
    return convertDocumentToText({
      name,
      mime: detected.mime,
      buffer: base64Decoded.buffer,
    });
  }

  const textDecoded = decodeUtf8Strict(base64Decoded.buffer);
  if (!textDecoded.ok) {
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

  return {
    ok: true,
    attachment: {
      name,
      text: normalizeNewlines(textDecoded.text),
    },
  };
}
