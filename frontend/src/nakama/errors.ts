function stringifyUnknown(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return String(value);
}

/** Nakama REST errors are rejected as `fetch` Response objects from nakama-js. */
export async function nakamaErrorMessage(err: unknown): Promise<string> {
  if (err instanceof Response) {
    try {
      const body = (await err.json()) as {
        message?: unknown;
        error?: unknown;
      };
      return (
        stringifyUnknown(body.message) ||
        stringifyUnknown(body.error) ||
        err.statusText ||
        `HTTP ${err.status}`
      );
    } catch {
      return err.statusText || `HTTP ${err.status}`;
    }
  }
  if (err instanceof Error) {
    return err.message || err.name || "Error";
  }
  if (err !== null && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const fromFields =
      stringifyUnknown(o.message) ||
      stringifyUnknown(o.msg) ||
      stringifyUnknown(o.error);
    if (fromFields) {
      return fromFields;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }
  return String(err);
}
