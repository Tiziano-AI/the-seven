export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type LogLevel = "debug" | "info" | "warn" | "error";

export function log(level: LogLevel, msg: string, fields: JsonObject = {}): void {
  const entry: JsonObject = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };

  const line = JSON.stringify(entry) + "\n";

  if (level === "error") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

export function errorToLogFields(error: unknown): JsonObject {
  if (error instanceof Error) {
    return {
      err_name: error.name,
      err_message: error.message,
    };
  }

  return {
    err_message: String(error),
  };
}

