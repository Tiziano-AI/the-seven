import { describe, expect, it } from "vitest";

import { decodeAttachmentToText } from "./attachments";

const DOCX_BASE64_HELLO =
  "UEsDBBQAAAAIAGJvk1udxYoq8gAAALkBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCE73kKy1eUOHBACCXpgZ8jcCgPsLI3iVV7bXnd0r49TgtFQpSjNfPNrKdb7b0TO0xsA/XyummlQNLBWJp6+b5+ru+k4AxkwAXCXh6Q5WqouvUhIosCE/dyzjneK8V6Rg/chIhUlDEkD7k806Qi6A1MqG7a9lbpQBkp13nJkEMlRPeII2xdFk/7opxuSehYioeTd6nrJcTorIZcdLUj86uo/ippCnn08GwjXxWDVJdKFvFyxw/6WiZK1qB4g5RfwBej+gjJKBP01he4+T/pj2vDOFqNZ35JiyloZC7be9ecFQ+Wvn/RqePwQ/UJUEsDBBQAAAAIAGJvk1tAoFMJsgAAAC8BAAALAAAAX3JlbHMvLnJlbHONz7sOgjAUBuCdp2jOLgUHYwyFxZiwGnyApj2URnpJWy+8vR0cxDg4ntt38jfd08zkjiFqZxnUZQUErXBSW8XgMpw2eyAxcSv57CwyWDBC1xbNGWee8k2ctI8kIzYymFLyB0qjmNDwWDqPNk9GFwxPuQyKei6uXCHdVtWOhk8D2oKQFUt6ySD0sgYyLB7/4d04aoFHJ24Gbfrx5WsjyzwoTAweLkgq3+0ys0BzSrqK2RYvUEsDBBQAAAAIAGJvk1sJPEnHsgAAAAIBAAARAAAAd29yZC9kb2N1bWVudC54bWw9jj0PgjAQhnd+RdNdig7GED4GjXFz0cS10kNI2jvSVpF/bwvB7Xnv3jx3Rf01mn3Aup6w5Ns04wywIdXjq+T323lz4Mx5iUpqQij5BI7XVVKMuaLmbQA9CwZ0+VjyzvshF8I1HRjpUhoAw64la6QP0b7ESFYNlhpwLhwwWuyybC+M7JFXCWPB+iQ1RZzDsNDMduU5+eoCWhNrLRl2uh4fhYjDtS7+/YizJsIij7Q+XyU/UEsBAhQDFAAAAAgAYm+TW53FiiryAAAAuQEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACABib5NbQKBTCbIAAAAvAQAACwAAAAAAAAAAAAAAgAEjAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACABib5NbCTxJx7IAAAACAQAAEQAAAAAAAAAAAAAAgAH+AQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAA3wIAAAAA";

const PDF_BASE64_HELLO =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NyA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjEwMCA3MDAgVGQKKEhlbGxvIGZyb20gUERGKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMzNyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQwNwolJUVPRgo=";

describe("decodeAttachmentToText", () => {
  it("decodes UTF-8 text attachments", async () => {
    const base64 = Buffer.from("hello\nworld", "utf8").toString("base64");
    const result = await decodeAttachmentToText({ name: "note.txt", base64 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.text).toContain("hello");
    expect(result.attachment.text).toContain("world");
  });

  it("extracts text from a PDF attachment", async () => {
    const result = await decodeAttachmentToText({ name: "hello.pdf", base64: PDF_BASE64_HELLO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.text).toMatch(/Hello from PDF/);
  });

  it("extracts text from a DOCX attachment", async () => {
    const result = await decodeAttachmentToText({ name: "hello.docx", base64: DOCX_BASE64_HELLO });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.text).toMatch(/Hello from DOCX/);
  });

  it("rejects unsupported binary attachments", async () => {
    // 1x1 PNG; enough for file-type to identify image/png.
    const result = await decodeAttachmentToText({
      name: "image.png",
      base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+V5eQAAAAASUVORK5CYII=",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unsupported_type");
    expect(result.error.message).toContain("image/png");
  });
});
