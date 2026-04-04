import type { Socket } from "@heroiclabs/nakama-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNakamaAuth } from "../auth/NakamaAuthContext";
import { nakamaErrorMessage } from "./errors";
import {
  clearTicRejoinState,
  readTicRejoinState,
  writeTicRejoinState,
} from "./ticRejoinStorage";

/** Ask server for snapshot on next match tick (recover missed broadcasts after join). */
const OP_SYNC_STATE = 3;

function wireMatchId(md: {
  match_id?: string;
  matchId?: string;
}): string {
  const raw = md.match_id ?? md.matchId;
  return raw != null ? String(raw) : "";
}

/** Nakama may use `uuid` vs `uuid.nakama1` across join vs match_data envelopes. */
function matchIdsEquivalent(a: string, b: string): boolean {
  const na = String(a).trim().toLowerCase();
  const nb = String(b).trim().toLowerCase();
  if (!na || !nb) {
    return true;
  }
  if (na === nb) {
    return true;
  }
  var ca = na.indexOf(".") >= 0 ? na.slice(0, na.indexOf(".")) : na;
  var cb = nb.indexOf(".") >= 0 ? nb.slice(0, nb.indexOf(".")) : nb;
  return ca === cb && ca.length > 0;
}

function queueSnapshotSync(sock: Socket, matchId: string): void {
  queueMicrotask(() => {
    void sock.sendMatchState(matchId, OP_SYNC_STATE, "{}");
  });
}

/** Server already dropped the ticket (matched, expired, or removed). */
function isMatchmakerTicketStaleMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("matchmaker ticket not found") || m.includes("ticket not found")
  );
}

export type TicGameSnapshot = {
  board: string[];
  phase: string;
  currentTurnUserId: string;
  winnerUserId: string;
  draw: boolean;
  marks: Record<string, string>;
  leaveReason?: string;
  roomSource?: string;
  timedMode?: boolean;
  turnSeconds?: number;
  turnDeadlineUnix?: number;
  serverTickRate?: number;
};

export type MatchmakerEnqueueOptions = {
  timed?: boolean;
};

type NakamaSocketContextValue = {
  socketConnected: boolean;
  socketError: string | null;
  clearSocketError: () => void;
  queueTicket: string | null;
  queueBusy: boolean;
  activeMatchId: string | null;
  gameSnapshot: TicGameSnapshot | null;
  enqueueMatchmaker: (opts?: MatchmakerEnqueueOptions) => Promise<void>;
  cancelMatchmaker: () => Promise<void>;
  leaveActiveMatch: () => Promise<void>;
  joinMatchById: (matchId: string) => Promise<boolean>;
  rejoinLastMatch: () => Promise<boolean>;
  sendTicMove: (row: number, col: number) => Promise<void>;
};

const NakamaSocketContext = createContext<NakamaSocketContextValue | null>(
  null,
);

export function NakamaSocketProvider({ children }: { children: ReactNode }) {
  const { client, session } = useNakamaAuth();
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [queueTicket, setQueueTicket] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [gameSnapshot, setGameSnapshot] = useState<TicGameSnapshot | null>(
    null,
  );

  const socketRef = useRef<Socket | null>(null);
  const activeMatchIdRef = useRef<string | null>(null);

  const applySnapshot = useCallback((snap: TicGameSnapshot) => {
    setGameSnapshot(snap);
    const mid = activeMatchIdRef.current;
    if (mid) {
      if (snap.phase === "finished") {
        clearTicRejoinState();
      } else {
        writeTicRejoinState({ matchId: mid, phase: snap.phase });
      }
    }
  }, []);

  useEffect(() => {
    if (!session) {
      clearTicRejoinState();
      socketRef.current = null;
      activeMatchIdRef.current = null;
      setSocketConnected(false);
      setQueueTicket(null);
      setActiveMatchId(null);
      setGameSnapshot(null);
      return;
    }

    const socket = client.createSocket(client.useSSL);
    socketRef.current = socket;

    socket.onmatchdata = (md) => {
      if (Number(md.op_code) !== 1) {
        return;
      }
      const mid = activeMatchIdRef.current;
      const incoming = wireMatchId(md);
      if (
        mid &&
        incoming &&
        !matchIdsEquivalent(incoming, String(mid))
      ) {
        return;
      }
      try {
        const text = new TextDecoder().decode(md.data);
        const snap = JSON.parse(text) as TicGameSnapshot;
        applySnapshot(snap);
      } catch {
        /* ignore malformed payloads */
      }
    };

    socket.onmatchmakermatched = async (mm) => {
      setQueueTicket(null);
      setSocketError(null);
      try {
        const wire = mm as {
          token?: string;
          match_id?: string;
          matchId?: string;
        };
        const token = wire.token?.trim();
        const matchId = (wire.match_id ?? wire.matchId)?.trim();
        const m = token
          ? await socket.joinMatch(undefined, token)
          : matchId
            ? await socket.joinMatch(matchId, undefined)
            : null;
        if (!m) {
          setSocketError(
            "Matchmaker matched but join token and match id were both missing.",
          );
          return;
        }
        activeMatchIdRef.current = m.match_id;
        setActiveMatchId(m.match_id);
        writeTicRejoinState({ matchId: m.match_id, phase: "waiting" });
        setGameSnapshot(null);
        queueSnapshotSync(socket, m.match_id);
      } catch (err) {
        setSocketError(await nakamaErrorMessage(err));
      }
    };

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let connectInFlight = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const clearEphemeralRealtime = () => {
      activeMatchIdRef.current = null;
      setQueueTicket(null);
      setActiveMatchId(null);
      setGameSnapshot(null);
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) {
        return;
      }
      const delayMs = Math.min(30_000, 1000 * 2 ** reconnectAttempt);
      reconnectAttempt = Math.min(reconnectAttempt + 1, 8);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void tryConnect();
      }, delayMs);
    };

    const tryConnect = async () => {
      if (cancelled || connectInFlight) {
        return;
      }
      connectInFlight = true;
      try {
        await socket.connect(session, true);
        if (cancelled) {
          return;
        }
        reconnectAttempt = 0;
        clearReconnectTimer();
        setSocketConnected(true);
        setSocketError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setSocketConnected(false);
        setSocketError(await nakamaErrorMessage(err));
        scheduleReconnect();
      } finally {
        connectInFlight = false;
      }
    };

    socket.ondisconnect = () => {
      if (cancelled) {
        return;
      }
      setSocketConnected(false);
      setSocketError(null);
      clearEphemeralRealtime();
      scheduleReconnect();
    };

    void tryConnect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      socket.disconnect(false);
      socketRef.current = null;
      activeMatchIdRef.current = null;
    };
  }, [client, session, applySnapshot]);

  const clearSocketError = useCallback(() => setSocketError(null), []);

  const enqueueMatchmaker = useCallback(
    async (opts?: MatchmakerEnqueueOptions) => {
      const sock = socketRef.current;
      if (!sock || !socketConnected) {
        setSocketError("Realtime socket is not ready yet.");
        return;
      }
      if (queueTicket || activeMatchIdRef.current) {
        return;
      }
      const timed = opts?.timed === true;
      // Separate pools: classic and timed must each declare +properties.mode:* so
      // wildcard "*" is never used (which could blur queues across modes).
      const query = timed
        ? "+properties.mode:timed"
        : "+properties.mode:classic";
      const stringProps = timed ? { mode: "timed" } : { mode: "classic" };
      setQueueBusy(true);
      setSocketError(null);
      try {
        const t = await sock.addMatchmaker(query, 2, 2, stringProps);
        setQueueTicket(t.ticket);
      } catch (err) {
        setSocketError(await nakamaErrorMessage(err));
      } finally {
        setQueueBusy(false);
      }
    },
    [socketConnected, queueTicket],
  );

  const cancelMatchmaker = useCallback(async () => {
    const sock = socketRef.current;
    if (!sock || !queueTicket) {
      return;
    }
    setQueueBusy(true);
    const ticket = queueTicket;
    try {
      await sock.removeMatchmaker(ticket);
      setQueueTicket(null);
    } catch (err) {
      const msg = await nakamaErrorMessage(err);
      if (isMatchmakerTicketStaleMessage(msg)) {
        setQueueTicket(null);
      } else {
        setSocketError(msg);
      }
    } finally {
      setQueueBusy(false);
    }
  }, [queueTicket]);

  const leaveActiveMatch = useCallback(async () => {
    const sock = socketRef.current;
    const mid = activeMatchIdRef.current;
    if (!sock || !mid) {
      return;
    }
    try {
      await sock.leaveMatch(mid);
    } catch (err) {
      setSocketError(await nakamaErrorMessage(err));
    }
    activeMatchIdRef.current = null;
    setActiveMatchId(null);
    setGameSnapshot(null);
    clearTicRejoinState();
  }, []);

  const joinMatchById = useCallback(
    async (matchId: string): Promise<boolean> => {
      const sock = socketRef.current;
      if (!sock || !socketConnected) {
        setSocketError("Realtime socket is not ready yet.");
        return false;
      }
      const id = matchId.trim();
      if (!id) {
        setSocketError("Match id is empty.");
        return false;
      }
      setSocketError(null);
      try {
        const m = await sock.joinMatch(id, undefined);
        activeMatchIdRef.current = m.match_id;
        setActiveMatchId(m.match_id);
        writeTicRejoinState({ matchId: m.match_id, phase: "waiting" });
        setGameSnapshot(null);
        queueSnapshotSync(sock, m.match_id);
        return true;
      } catch (err) {
        setSocketError(await nakamaErrorMessage(err));
        return false;
      }
    },
    [socketConnected],
  );

  const rejoinLastMatch = useCallback(async (): Promise<boolean> => {
    const s = readTicRejoinState();
    if (!s?.matchId) {
      return false;
    }
    return joinMatchById(s.matchId);
  }, [joinMatchById]);

  const sendTicMove = useCallback(async (row: number, col: number) => {
    const sock = socketRef.current;
    const mid = activeMatchIdRef.current;
    if (!sock || !mid) {
      return;
    }
    const payload = JSON.stringify({ row, col });
    try {
      await sock.sendMatchState(mid, 2, payload);
    } catch (err) {
      setSocketError(await nakamaErrorMessage(err));
    }
  }, []);

  const value = useMemo(
    () => ({
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
      joinMatchById,
      rejoinLastMatch,
      sendTicMove,
    }),
    [
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
      joinMatchById,
      rejoinLastMatch,
      sendTicMove,
    ],
  );

  return (
    <NakamaSocketContext.Provider value={value}>
      {children}
    </NakamaSocketContext.Provider>
  );
}

export function useNakamaSocket() {
  const ctx = useContext(NakamaSocketContext);
  if (!ctx) {
    throw new Error("useNakamaSocket must be used within NakamaSocketProvider");
  }
  return ctx;
}
