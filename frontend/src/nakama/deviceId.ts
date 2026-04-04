const STORAGE_KEY = "lila:nakama:deviceId";

/**
 * Web apps lack a stable hardware device id. Persist a UUID in localStorage.
 * Per Nakama docs, device ids must be alphanumeric with dashes, 10–128 bytes.
 */
export function getOrCreateWebDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && isValidDeviceId(existing)) {
      return existing;
    }
  } catch {
    /* private mode */
  }
  const id = crypto.randomUUID();
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* still return id for this session */
  }
  return id;
}

export function isValidDeviceId(id: string): boolean {
  return /^[a-zA-Z0-9-]{10,128}$/.test(id);
}

export function resetStoredDeviceId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
