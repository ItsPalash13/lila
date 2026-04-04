import { useCallback, useEffect, useState } from "react";
import type { Session } from "@heroiclabs/nakama-js";
import { useNakamaAuth } from "../auth/NakamaAuthContext";
import { nakamaErrorMessage } from "../nakama/errors";
import { rpcTicStatistics } from "../nakama/ticStatistics";
import "./LeaderboardPanel.css";

const LB_RATING = "tic_rating";

type Row = { rank: string; username: string; score: number };

type Props = {
  session: Session;
  onBack: () => void;
};

export function LeaderboardPanel({ session, onBack }: Props) {
  const { client } = useNakamaAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [youLine, setYouLine] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, statRes] = await Promise.all([
        client.listLeaderboardRecords(session, LB_RATING, [], 5),
        rpcTicStatistics(client, session),
      ]);
      const records = list.records ?? [];
      const ids = records
        .map((r) => r.owner_id)
        .filter((x): x is string => Boolean(x));
      const users =
        ids.length > 0 ? (await client.getUsers(session, ids)).users ?? [] : [];
      const nameById = new Map(
        users.map((u) => [
          u.id ?? "",
          u.username || u.display_name || u.id || "Player",
        ]),
      );
      setRows(
        records.map((r) => ({
          rank: String(r.rank ?? "—"),
          username:
            (r.owner_id && nameById.get(r.owner_id)) ||
            r.username ||
            r.owner_id ||
            "—",
          score: Number(r.score ?? 0),
        })),
      );

      if (statRes.ok) {
        const d = statRes.data;
        const rankPart = d.rank > 0 ? ` · Rank #${d.rank}` : "";
        setYouLine(`Your rating: ${d.rating}${rankPart} · W/L/D ${d.total_wins}/${d.total_losses}/${d.total_draws} · Best streak ${d.best_streak}`);
      } else {
        setYouLine(null);
      }
    } catch (e) {
      setError(await nakamaErrorMessage(e));
      setRows([]);
      setYouLine(null);
    } finally {
      setLoading(false);
    }
  }, [client, session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="leaderboard-panel">
      <button
        type="button"
        className="auth-button-secondary leaderboard-panel__back"
        onClick={onBack}
      >
        Back
      </button>
      <h2 className="leaderboard-panel__title">Top players (rating)</h2>
      <p className="leaderboard-panel__rules">
        Rating: +4 when you win, −1 when you lose. Draws do not change rating.
      </p>
      {youLine ? (
        <p className="leaderboard-panel__streak">{youLine}</p>
      ) : null}
      {loading ? <p className="leaderboard-panel__hint">Loading…</p> : null}
      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="leaderboard-panel__hint">No ratings yet. Play a match!</p>
      ) : null}
      {rows.length > 0 ? (
        <ol className="leaderboard-panel__list">
          {rows.map((r, i) => (
            <li key={`${r.username}-${i}`} className="leaderboard-panel__row">
              <span className="leaderboard-panel__rank">{r.rank}</span>
              <span className="leaderboard-panel__name">{r.username}</span>
              <span className="leaderboard-panel__score">{r.score} pts</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
