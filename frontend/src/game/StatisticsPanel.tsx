import { useCallback, useEffect, useState } from "react";
import type { Session } from "@heroiclabs/nakama-js";
import { useNakamaAuth } from "../auth/NakamaAuthContext";
import { nakamaErrorMessage } from "../nakama/errors";
import { rpcTicStatistics } from "../nakama/ticStatistics";
import type { TicStatisticsPayload } from "../nakama/ticStatistics";
import "./StatisticsPanel.css";

const LB_RATING = "tic_rating";

type RatingRow = { rank: string; username: string; score: number };

type Props = {
  session: Session;
  onBack: () => void;
};

function formatWhen(ts: number): string {
  if (!ts) {
    return "—";
  }
  try {
    return new Date(ts * 1000).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function resultLabel(result: string): string {
  if (result === "win") {
    return "Win";
  }
  if (result === "loss") {
    return "Loss";
  }
  if (result === "draw") {
    return "Draw";
  }
  return result || "—";
}

export function StatisticsPanel({ session, onBack }: Props) {
  const { client } = useNakamaAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TicStatisticsPayload | null>(null);
  const [top5, setTop5] = useState<RatingRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statRes, list] = await Promise.all([
        rpcTicStatistics(client, session),
        client.listLeaderboardRecords(session, LB_RATING, [], 5),
      ]);

      if (!statRes.ok) {
        setStats(null);
        setError(statRes.error);
        setTop5([]);
        setNames(new Map());
        return;
      }
      setStats(statRes.data);

      const records = list.records ?? [];
      const ids = records
        .map((r) => r.owner_id)
        .filter((x): x is string => Boolean(x));
      const histIds = statRes.data.history
        .map((h) => h.opponent_id)
        .filter(Boolean);
      const allIds = [...new Set([...ids, ...histIds])];
      const users =
        allIds.length > 0
          ? (await client.getUsers(session, allIds)).users ?? []
          : [];
      const map = new Map(
        users.map((u) => [
          u.id ?? "",
          u.username || u.display_name || u.id || "Player",
        ]),
      );
      setNames(map);

      setTop5(
        records.map((r) => ({
          rank: String(r.rank ?? "—"),
          username:
            (r.owner_id && map.get(r.owner_id)) ||
            r.username ||
            r.owner_id ||
            "—",
          score: Number(r.score ?? 0),
        })),
      );
    } catch (e) {
      setError(await nakamaErrorMessage(e));
      setStats(null);
      setTop5([]);
    } finally {
      setLoading(false);
    }
  }, [client, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = stats;

  return (
    <div className="statistics-panel">
      <button
        type="button"
        className="auth-button-secondary statistics-panel__back"
        onClick={onBack}
      >
        Back
      </button>
      <h2 className="statistics-panel__title">Statistics</h2>
      <p className="statistics-panel__rules">
        Global rating: +4 per win, −1 per loss (draws unchanged).
      </p>

      {loading ? <p className="statistics-panel__hint">Loading…</p> : null}
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && !error && s ? (
        <>
          <section className="statistics-panel__summary" aria-label="Summary">
            <div className="statistics-panel__stat-grid">
              <div className="statistics-panel__stat">
                <span className="statistics-panel__stat-label">Wins</span>
                <span className="statistics-panel__stat-value">{s.total_wins}</span>
              </div>
              <div className="statistics-panel__stat">
                <span className="statistics-panel__stat-label">Losses</span>
                <span className="statistics-panel__stat-value">{s.total_losses}</span>
              </div>
              <div className="statistics-panel__stat">
                <span className="statistics-panel__stat-label">Draws</span>
                <span className="statistics-panel__stat-value">{s.total_draws}</span>
              </div>
              <div className="statistics-panel__stat">
                <span className="statistics-panel__stat-label">Max streak</span>
                <span className="statistics-panel__stat-value">{s.best_streak}</span>
              </div>
              <div className="statistics-panel__stat">
                <span className="statistics-panel__stat-label">Rating</span>
                <span className="statistics-panel__stat-value">{s.rating}</span>
              </div>
              <div className="statistics-panel__stat">
                <span className="statistics-panel__stat-label">Global rank</span>
                <span className="statistics-panel__stat-value">
                  {s.rank > 0 ? `#${s.rank}` : "—"}
                </span>
              </div>
            </div>
            <p className="statistics-panel__streak-sub">
              Current streak: {s.current_streak}
            </p>
          </section>

          <section className="statistics-panel__section" aria-label="Match history">
            <h3 className="statistics-panel__subtitle">Recent matches</h3>
            {s.history.length === 0 ? (
              <p className="statistics-panel__hint">No recorded matches yet.</p>
            ) : (
              <ul className="statistics-panel__history">
                {s.history.map((h, i) => (
                  <li key={`${h.match_id}-${h.finished_at}-${i}`} className="statistics-panel__history-row">
                    <span className="statistics-panel__history-when">
                      {formatWhen(h.finished_at)}
                    </span>
                    <span className="statistics-panel__history-vs">
                      vs{" "}
                      {h.opponent_id
                        ? names.get(h.opponent_id) ?? h.opponent_id.slice(0, 8) + "…"
                        : "—"}
                    </span>
                    <span
                      className={
                        h.result === "win"
                          ? "statistics-panel__history-result statistics-panel__history-result--win"
                          : h.result === "loss"
                            ? "statistics-panel__history-result statistics-panel__history-result--loss"
                            : "statistics-panel__history-result"
                      }
                    >
                      {resultLabel(h.result)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="statistics-panel__section" aria-label="Global top 5">
            <h3 className="statistics-panel__subtitle">Global top 5 (rating)</h3>
            {top5.length === 0 ? (
              <p className="statistics-panel__hint">No ratings yet.</p>
            ) : (
              <ol className="statistics-panel__top-list">
                {top5.map((r, idx) => (
                  <li key={`${r.username}-${idx}`} className="statistics-panel__top-row">
                    <span className="statistics-panel__top-rank">{r.rank}</span>
                    <span className="statistics-panel__top-name">{r.username}</span>
                    <span className="statistics-panel__top-score">{r.score} pts</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
