import type { Session } from "@heroiclabs/nakama-js";

const STORAGE_KEY = "lila_nakama_session_v1";

type StoredShape = {
  token: string;
  refresh_token: string;
};

export function persistNakamaSession(session: Session): void {
  const payload: StoredShape = {
    token: session.token,
    refresh_token: session.refresh_token,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearPersistedNakamaSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function readPersistedNakamaSession(): StoredShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const o = JSON.parse(raw) as unknown;
    if (
      !o ||
      typeof o !== "object" ||
      typeof (o as StoredShape).token !== "string" ||
      typeof (o as StoredShape).refresh_token !== "string"
    ) {
      return null;
    }
    return o as StoredShape;
  } catch {
    return null;
  }
}
