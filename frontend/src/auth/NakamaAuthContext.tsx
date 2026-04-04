import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Session, type Client } from "@heroiclabs/nakama-js";
import { createNakamaClient } from "../nakama/client";
import {
  clearPersistedNakamaSession,
  persistNakamaSession,
  readPersistedNakamaSession,
} from "./persistNakamaSession";

type NakamaAuthContextValue = {
  client: Client;
  session: Session | null;
  /** False until we finish reading localStorage / optional refresh (avoids login flash). */
  authReady: boolean;
  setSession: (session: Session | null) => void;
};

const NakamaAuthContext = createContext<NakamaAuthContextValue | null>(null);

export function NakamaAuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createNakamaClient(), []);
  const [session, setSessionState] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const setSession = useCallback((next: Session | null) => {
    if (!next) {
      clearPersistedNakamaSession();
    } else {
      persistNakamaSession(next);
    }
    setSessionState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readPersistedNakamaSession();
      if (!stored) {
        if (!cancelled) {
          setAuthReady(true);
        }
        return;
      }
      try {
        const restored = Session.restore(stored.token, stored.refresh_token);
        const now = Date.now() / 1000;
        if (restored.isrefreshexpired(now)) {
          clearPersistedNakamaSession();
          return;
        }
        if (restored.isexpired(now)) {
          await client.sessionRefresh(restored);
        }
        if (!cancelled) {
          setSession(restored);
        }
      } catch {
        clearPersistedNakamaSession();
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, setSession]);

  const value = useMemo(
    () => ({ client, session, authReady, setSession }),
    [client, session, authReady, setSession],
  );

  return (
    <NakamaAuthContext.Provider value={value}>
      {children}
    </NakamaAuthContext.Provider>
  );
}

export function useNakamaAuth() {
  const ctx = useContext(NakamaAuthContext);
  if (!ctx) {
    throw new Error("useNakamaAuth must be used within NakamaAuthProvider");
  }
  return ctx;
}

export function useSignOut() {
  const { setSession } = useNakamaAuth();
  return useCallback(() => setSession(null), [setSession]);
}
