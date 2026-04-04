import type { Client, Session } from "@heroiclabs/nakama-js";
import { nakamaErrorMessage } from "./errors";

export type TicMatchHistoryEntry = {
  opponent_id: string;
  result: string;
  finished_at: number;
  match_id: string;
};

export type TicStatisticsPayload = {
  total_wins: number;
  total_losses: number;
  total_draws: number;
  current_streak: number;
  best_streak: number;
  last_result: string;
  rating: number;
  rank: number;
  history: TicMatchHistoryEntry[];
};

export type TicStatisticsResult =
  | { ok: true; data: TicStatisticsPayload }
  | { ok: false; error: string };

function parsePayload(raw: unknown): TicStatisticsPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if ("error" in o && typeof o.error === "string") {
    return null;
  }
  const historyRaw = o.history;
  const history: TicMatchHistoryEntry[] = Array.isArray(historyRaw)
    ? historyRaw.map((h) => {
        const x = h as Record<string, unknown>;
        return {
          opponent_id: typeof x.opponent_id === "string" ? x.opponent_id : "",
          result: typeof x.result === "string" ? x.result : "",
          finished_at:
            typeof x.finished_at === "number" ? x.finished_at : 0,
          match_id: typeof x.match_id === "string" ? x.match_id : "",
        };
      })
    : [];

  return {
    total_wins: typeof o.total_wins === "number" ? o.total_wins : 0,
    total_losses: typeof o.total_losses === "number" ? o.total_losses : 0,
    total_draws: typeof o.total_draws === "number" ? o.total_draws : 0,
    current_streak:
      typeof o.current_streak === "number" ? o.current_streak : 0,
    best_streak: typeof o.best_streak === "number" ? o.best_streak : 0,
    last_result: typeof o.last_result === "string" ? o.last_result : "",
    rating: typeof o.rating === "number" ? o.rating : 0,
    rank: typeof o.rank === "number" ? o.rank : 0,
    history,
  };
}

export async function rpcTicStatistics(
  client: Client,
  session: Session,
): Promise<TicStatisticsResult> {
  try {
    const res = await client.rpc(session, "tic_statistics", {});
    const parsed = parsePayload(res.payload);
    if (!parsed) {
      const err =
        res.payload &&
        typeof res.payload === "object" &&
        typeof (res.payload as { error?: string }).error === "string"
          ? (res.payload as { error: string }).error
          : "Invalid tic_statistics response";
      return { ok: false, error: err };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: await nakamaErrorMessage(e) };
  }
}
