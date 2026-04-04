import { useEffect, useRef, useState } from "react";
import {
  playGameDraw,
  playGameLose,
  playGameWin,
  playMatchStarted,
  playUiClick,
} from "../assets/sound/gameAudio";
import { useNakamaAuth } from "../auth/NakamaAuthContext";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useNakamaSocket } from "../nakama/NakamaSocketContext";
import type { TicGameSnapshot } from "../nakama/NakamaSocketContext";
import "./TicTacToe.css";

const emptyBoard = () => ["", "", "", "", "", "", "", "", ""];

/**
 * Last `autoQueueFromHomeToken` we already used to call addMatchmaker.
 * Prevents re-queue after leave match / cancel queue until user opens from home again.
 */
let lastConsumedAutoQueueToken = -1;

export type TicTacToePanelProps = {
  userId: string;
  /**
   * Incremented when user opens the game from home; each new value triggers one
   * automatic addMatchmaker (not after leave/cancel on the same visit).
   */
  autoQueueFromHomeToken?: number;
  /** Private / join-by-id flows must not consume the home quick-match token. */
  skipAutoMatchmaker?: boolean;
  /** When true, quick match from home uses timed queue + 30s turns. */
  quickMatchTimed?: boolean;
  /** When set, use shell layout; Leave game / Home return here after leaving realtime state. */
  onExitToHome?: () => void;
};

export function TicTacToePanel({
  userId,
  autoQueueFromHomeToken = 0,
  skipAutoMatchmaker = false,
  quickMatchTimed = false,
  onExitToHome,
}: TicTacToePanelProps) {
  const breakpoint = useBreakpoint();
  const { client, session } = useNakamaAuth();
  const {
    socketConnected,
    socketError,
    clearSocketError,
    queueTicket,
    queueBusy,
    activeMatchId,
    gameSnapshot,
    enqueueMatchmaker,
    cancelMatchmaker,
    leaveActiveMatch,
    sendTicMove,
  } = useNakamaSocket();

  const [playAgainBusy, setPlayAgainBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [opponentLabel, setOpponentLabel] = useState<string | null>(null);
  const [, setCountdownTick] = useState(0);
  const prevSnapshotRef = useRef<TicGameSnapshot | null>(null);

  const uid = userId;
  const embedded = Boolean(onExitToHome);

  useEffect(() => {
    if (!onExitToHome) {
      return;
    }
    if (skipAutoMatchmaker) {
      return;
    }
    if (autoQueueFromHomeToken <= 0) {
      return;
    }
    if (!socketConnected) {
      return;
    }
    if (queueTicket || activeMatchId) {
      return;
    }
    if (autoQueueFromHomeToken <= lastConsumedAutoQueueToken) {
      return;
    }
    lastConsumedAutoQueueToken = autoQueueFromHomeToken;
    void enqueueMatchmaker({ timed: quickMatchTimed });
  }, [
    onExitToHome,
    skipAutoMatchmaker,
    quickMatchTimed,
    autoQueueFromHomeToken,
    socketConnected,
    queueTicket,
    activeMatchId,
    enqueueMatchmaker,
  ]);

  useEffect(() => {
    if (!session || !gameSnapshot?.marks) {
      setOpponentLabel(null);
      return;
    }
    const ids = Object.keys(gameSnapshot.marks);
    const other = ids.find((id) => id !== uid);
    if (!other) {
      setOpponentLabel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await client.getUsers(session, [other]);
        const u = res.users?.[0];
        const name =
          u?.username || u?.display_name || `Player ${other.slice(0, 8)}…`;
        if (!cancelled) {
          setOpponentLabel(name);
        }
      } catch {
        if (!cancelled) {
          setOpponentLabel(`Player ${other.slice(0, 8)}…`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, session, gameSnapshot?.marks, uid]);

  useEffect(() => {
    if (
      !gameSnapshot?.timedMode ||
      gameSnapshot.phase !== "playing" ||
      !gameSnapshot.turnDeadlineUnix
    ) {
      return;
    }
    const id = window.setInterval(() => setCountdownTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [
    gameSnapshot?.timedMode,
    gameSnapshot?.phase,
    gameSnapshot?.turnDeadlineUnix,
  ]);

  useEffect(() => {
    const snap = gameSnapshot;
    const prev = prevSnapshotRef.current;

    if (!snap) {
      prevSnapshotRef.current = null;
      return;
    }

    if (prev) {
      if (snap.phase === "playing" && prev.phase === "waiting") {
        playMatchStarted();
      } else if (snap.phase === "finished" && prev.phase !== "finished") {
        if (snap.draw) {
          playGameDraw();
        } else if (snap.winnerUserId === uid) {
          playGameWin();
        } else if (snap.winnerUserId) {
          playGameLose();
        }
      }
    }

    prevSnapshotRef.current = snap;
  }, [gameSnapshot, uid]);

  const awaitingAutoQueueFromHome =
    embedded &&
    !skipAutoMatchmaker &&
    autoQueueFromHomeToken > 0 &&
    autoQueueFromHomeToken > lastConsumedAutoQueueToken &&
    !activeMatchId &&
    !queueTicket &&
    !queueBusy;

  const lobbyIdle =
    embedded &&
    !activeMatchId &&
    !queueTicket &&
    !queueBusy &&
    !awaitingAutoQueueFromHome;
  const inQueue = !activeMatchId && Boolean(queueTicket || queueBusy);

  const secondsLeft =
    gameSnapshot?.timedMode &&
    gameSnapshot.phase === "playing" &&
    typeof gameSnapshot.turnDeadlineUnix === "number"
      ? Math.max(0, Math.ceil(gameSnapshot.turnDeadlineUnix - Date.now() / 1000))
      : null;

  const statusText = (() => {
    if (!socketConnected) {
      return "Connecting realtime…";
    }
    if (queueTicket && !activeMatchId) {
      return quickMatchTimed
        ? "Finding a timed opponent…"
        : "Finding an opponent…";
    }
    if (queueBusy && !activeMatchId) {
      return quickMatchTimed
        ? "Finding a timed opponent…"
        : "Finding an opponent…";
    }
    if (awaitingAutoQueueFromHome) {
      return quickMatchTimed
        ? "Finding a timed opponent…"
        : "Finding an opponent…";
    }
    if (!activeMatchId) {
      if (embedded) {
        return quickMatchTimed
          ? "Quick match (timed · 30s per move)."
          : "Quick match with a random opponent.";
      }
      return "Queue for a random opponent, then play on the shared board.";
    }
    if (!gameSnapshot) {
      return "Syncing match state…";
    }
    if (gameSnapshot.phase === "waiting") {
      return "Waiting for a second player…";
    }
    if (gameSnapshot.phase === "finished") {
      if (gameSnapshot.draw) {
        return "Game over — draw.";
      }
      if (gameSnapshot.winnerUserId === uid) {
        if (gameSnapshot.leaveReason === "timeout") {
          return "You win — opponent ran out of time.";
        }
        if (gameSnapshot.leaveReason === "opponent_left") {
          return "You win — opponent left.";
        }
        return "You win.";
      }
      if (gameSnapshot.leaveReason === "timeout") {
        return "Game over — you ran out of time.";
      }
      return "Game over — opponent won.";
    }
    if (gameSnapshot.currentTurnUserId === uid) {
      return "Your turn.";
    }
    return "Opponent's turn.";
  })();

  const cells = gameSnapshot?.board ?? emptyBoard();

  const canPlayCell = (index: number) => {
    if (!gameSnapshot || gameSnapshot.phase !== "playing") {
      return false;
    }
    if (gameSnapshot.currentTurnUserId !== uid) {
      return false;
    }
    return cells[index] === "";
  };

  const onCell = (row: number, col: number) => {
    const i = row * 3 + col;
    if (!canPlayCell(i)) {
      return;
    }
    playUiClick();
    void sendTicMove(row, col);
  };

  const yourMark = gameSnapshot?.marks?.[uid] ?? "";

  const isFinished = gameSnapshot?.phase === "finished";

  const timedLabel =
    gameSnapshot?.timedMode && typeof gameSnapshot.turnSeconds === "number"
      ? `Timed · ${gameSnapshot.turnSeconds}s/move`
      : null;

  const onPlayAgain = async () => {
    setPlayAgainBusy(true);
    try {
      await leaveActiveMatch();
      if (socketConnected) {
        await enqueueMatchmaker({
          timed: Boolean(gameSnapshot?.timedMode),
        });
      }
    } finally {
      setPlayAgainBusy(false);
    }
  };

  /** Cancel queue / leave match and return to shell home (embedded only). */
  const goHomeFromShell = async () => {
    setExitBusy(true);
    try {
      if (queueTicket) {
        await cancelMatchmaker();
      }
      await leaveActiveMatch();
      onExitToHome?.();
    } finally {
      setExitBusy(false);
    }
  };

  const onLeaveGame = async () => {
    setExitBusy(true);
    try {
      await leaveActiveMatch();
      onExitToHome?.();
    } finally {
      setExitBusy(false);
    }
  };

  const onCancelQueue = async () => {
    if (!queueTicket) {
      return;
    }
    setExitBusy(true);
    try {
      await cancelMatchmaker();
      if (embedded) {
        onExitToHome?.();
      }
    } finally {
      setExitBusy(false);
    }
  };

  const enqueueTimed = () =>
    void enqueueMatchmaker({ timed: quickMatchTimed });

  return (
    <div className="tic-panel tic-panel--screen">
      {socketError ? (
        <div className="auth-error" role="alert">
          {socketError}{" "}
          <button
            type="button"
            className="tic-panel__dismiss"
            onClick={clearSocketError}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {lobbyIdle ? (
        <div className="tic-panel__lobby">
          <button
            type="button"
            className="tic-panel__lobby-back auth-button-secondary"
            disabled={exitBusy}
            onClick={() => void goHomeFromShell()}
          >
            {exitBusy ? "Leaving…" : "Home"}
          </button>
          <div className="tic-panel__lobby-center">
            <p className="tic-panel__lobby-hint">{statusText}</p>
            <button
              type="button"
              className="home-play-cta auth-session__primary"
              disabled={!socketConnected || exitBusy}
              onClick={() => {
                playUiClick();
                enqueueTimed();
              }}
            >
              Play
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="tic-panel__status">{statusText}</p>
          {timedLabel ? (
            <p className="tic-panel__mode">{timedLabel}</p>
          ) : null}
          {opponentLabel && activeMatchId && gameSnapshot?.phase !== "waiting"
            ? (
              <p className="tic-panel__opponent">vs {opponentLabel}</p>
            )
            : null}
          {secondsLeft !== null ? (
            <p className="tic-panel__countdown" aria-live="polite">
              {gameSnapshot?.currentTurnUserId === uid
                ? `Your clock: ${secondsLeft}s`
                : `Opponent clock: ${secondsLeft}s`}
            </p>
          ) : null}
          {activeMatchId &&
          (gameSnapshot?.phase === "waiting" || !gameSnapshot) ? (
            <div className="tic-panel__room-id">
              <span className="tic-panel__room-id-label">Room id</span>
              <code className="tic-panel__room-id-value">{activeMatchId}</code>
              <button
                type="button"
                className="tic-panel__room-id-copy auth-button-secondary"
                onClick={() =>
                  void navigator.clipboard?.writeText(activeMatchId)
                }
              >
                Copy
              </button>
            </div>
          ) : null}
          {yourMark ? (
            <p className="tic-panel__mark">You are playing as {yourMark}.</p>
          ) : null}
          <div className="tic-panel__actions">
            {!embedded ? (
              <button
                type="button"
                disabled={
                  !socketConnected ||
                  queueBusy ||
                  Boolean(queueTicket) ||
                  Boolean(activeMatchId)
                }
                onClick={() => {
                  playUiClick();
                  void enqueueMatchmaker({ timed: false });
                }}
              >
                Find match
              </button>
            ) : null}
            {(embedded && inQueue) || !embedded ? (
              <button
                type="button"
                disabled={!queueTicket || queueBusy || exitBusy}
                onClick={() => void onCancelQueue()}
              >
                {exitBusy ? "Leaving…" : "Cancel queue"}
              </button>
            ) : null}
            {activeMatchId ? (
              <button
                type="button"
                disabled={!activeMatchId || exitBusy}
                onClick={() =>
                  embedded ? void onLeaveGame() : void leaveActiveMatch()
                }
              >
                {exitBusy ? "Leaving…" : "Leave game"}
              </button>
            ) : null}
            {isFinished ? (
              <button
                type="button"
                className="tic-panel__play-again"
                disabled={
                  !socketConnected || playAgainBusy || queueBusy || exitBusy
                }
                onClick={() => void onPlayAgain()}
              >
                {playAgainBusy ? "Starting…" : "Play again"}
              </button>
            ) : null}
          </div>
          {activeMatchId ? (
            <div
              className="tic-board-wrap"
              data-bp={breakpoint}
              role="presentation"
            >
              <div className="tic-board" role="grid" aria-label="Tic tac toe board">
                {[0, 1, 2].flatMap((row) =>
                  [0, 1, 2].map((col) => {
                    const i = row * 3 + col;
                    return (
                      <button
                        key={i}
                        type="button"
                        className="tic-cell"
                        disabled={!canPlayCell(i)}
                        onClick={() => onCell(row, col)}
                        aria-label={`Cell row ${row + 1} column ${col + 1}`}
                      >
                        {cells[i] || "\u00a0"}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
