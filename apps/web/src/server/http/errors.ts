import "server-only";

import type { ErrorKind } from "@the-seven/contracts";

export class EdgeError extends Error {
  readonly kind: ErrorKind;
  readonly details: object;
  readonly status: number;

  constructor(input: { kind: ErrorKind; message: string; details: object; status: number }) {
    super(input.message);
    this.kind = input.kind;
    this.details = input.details;
    this.status = input.status;
  }
}
