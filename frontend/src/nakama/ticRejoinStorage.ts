const REJOIN_KEY = "lila_tic_rejoin_state";

export type TicRejoinState = {
  matchId: string;
  phase: string;
};

export function readTicRejoinState(): TicRejoinState | null {
  try {
    const raw = sessionStorage.getItem(REJOIN_KEY);
    if (!raw) {
      return null;
    }
    const o = JSON.parse(raw) as unknown;
    if (
      !o ||
      typeof o !== "object" ||
      typeof (o as TicRejoinState).matchId !== "string" ||
      typeof (o as TicRejoinState).phase !== "string"
    ) {
      return null;
    }
    return o as TicRejoinState;
  } catch {
    return null;
  }
}

export function writeTicRejoinState(state: TicRejoinState): void {
  sessionStorage.setItem(REJOIN_KEY, JSON.stringify(state));
}

export function clearTicRejoinState(): void {
  sessionStorage.removeItem(REJOIN_KEY);
}

export function canOfferTicRejoin(): boolean {
  const s = readTicRejoinState();
  if (!s) {
    return false;
  }
  return s.phase === "waiting" || s.phase === "playing";
}
