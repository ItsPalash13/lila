import { useEffect, useRef, useState } from "react";
import type { Session } from "@heroiclabs/nakama-js";
import { AccountEditor } from "../account/AccountEditor";
import { LeaderboardPanel } from "../game/LeaderboardPanel";
import { StatisticsPanel } from "../game/StatisticsPanel";
import { TicTacToePanel } from "../game/TicTacToePanel";
import { resolveAvatarDisplayUrl } from "../account/avatarOptions";
import { useNakamaSocket } from "../nakama/NakamaSocketContext";
import { rpcCreateTicRoom } from "../nakama/ticRpc";
import { canOfferTicRejoin } from "../nakama/ticRejoinStorage";
import { nakamaErrorMessage } from "../nakama/errors";
import { useNakamaAuth, useSignOut } from "./NakamaAuthContext";
import "./Auth.css";

type ShellView = "home" | "game" | "profile" | "leaderboard" | "statistics";

type GameEntryMode =
  | { kind: "quick"; timed: boolean }
  | { kind: "no_auto" };

export function SessionDashboard({ session }: { session: Session }) {
  const { client } = useNakamaAuth();
  const signOut = useSignOut();
  const {
    socketError,
    clearSocketError,
    joinMatchById,
    rejoinLastMatch,
    socketConnected,
    activeMatchId,
  } = useNakamaSocket();
  const [view, setView] = useState<ShellView>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountTick, setAccountTick] = useState(0);
  const [gameAutoQueueToken, setGameAutoQueueToken] = useState(0);
  const [gameEntry, setGameEntry] = useState<GameEntryMode>({
    kind: "quick",
    timed: false,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const [displayName, setDisplayName] = useState<string | undefined>();
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();

  const [joinIdInput, setJoinIdInput] = useState("");
  const [homeBusy, setHomeBusy] = useState<string | null>(null);
  const [createTimed, setCreateTimed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const account = await client.getAccount(session);
        if (cancelled) {
          return;
        }
        setDisplayName(account.user?.display_name);
        setAvatarUrl(account.user?.avatar_url);
      } catch {
        if (!cancelled) {
          setDisplayName(undefined);
          setAvatarUrl(undefined);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, session, session.token, accountTick]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const headerAvatar = resolveAvatarDisplayUrl(avatarUrl);
  const profileLabel =
    displayName?.trim() || session.username || "Account";

  const openProfile = () => {
    setMenuOpen(false);
    setView("profile");
  };

  const openStatistics = () => {
    setMenuOpen(false);
    setView("statistics");
  };

  const backFromProfile = () => {
    setAccountTick((t) => t + 1);
    setView("home");
  };

  const exitGameToHome = () => {
    setGameEntry({ kind: "quick", timed: false });
    setView("home");
  };

  const openQuick = (timed: boolean) => {
    setGameEntry({ kind: "quick", timed });
    setGameAutoQueueToken((t) => t + 1);
    setView("game");
  };

  const onCreateRoom = async () => {
    setHomeBusy("Creating room…");
    try {
      const r = await rpcCreateTicRoom(client, session, {
        timed: createTimed,
        turnSeconds: 30,
      });
      if ("error" in r) {
        setHomeBusy(r.error);
        return;
      }
      const joined = await joinMatchById(r.match_id);
      if (!joined) {
        return;
      }
      setGameEntry({ kind: "no_auto" });
      setView("game");
    } catch (e) {
      setHomeBusy(await nakamaErrorMessage(e));
    } finally {
      setHomeBusy(null);
    }
  };

  const onJoinById = async () => {
    const id = joinIdInput.trim();
    if (!id) {
      setHomeBusy("Enter a match id");
      return;
    }
    setHomeBusy("Joining…");
    try {
      const joined = await joinMatchById(id);
      if (!joined) {
        return;
      }
      setGameEntry({ kind: "no_auto" });
      setView("game");
    } catch (e) {
      setHomeBusy(await nakamaErrorMessage(e));
    } finally {
      setHomeBusy(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-header__title">Lila · Nakama</h1>
        <div className="app-header__profile-wrap" ref={menuRef}>
          <button
            type="button"
            className="app-header__profile-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Account menu for ${profileLabel}`}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {headerAvatar ? (
              <img
                src={headerAvatar}
                alt=""
                className="app-header__avatar"
              />
            ) : (
              <span className="app-header__avatar-fallback" aria-hidden>
                {(session.username || "P").slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
          {menuOpen ? (
            <div className="profile-menu" role="menu">
              <button
                type="button"
                className="profile-menu__item"
                role="menuitem"
                onClick={openProfile}
              >
                Edit profile
              </button>
              <button
                type="button"
                className="profile-menu__item"
                role="menuitem"
                onClick={openStatistics}
              >
                Statistics
              </button>
              <button
                type="button"
                className="profile-menu__item"
                role="menuitem"
                onClick={() => signOut()}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="app-shell__main">
        {view === "home" ? (
          <div className="home-screen home-screen--stack">
            <div className="home-screen__actions">
              {socketConnected &&
              !activeMatchId &&
              canOfferTicRejoin() ? (
                <button
                  type="button"
                  className="home-rejoin-cta auth-session__primary"
                  onClick={() => {
                    setGameEntry({ kind: "no_auto" });
                    void rejoinLastMatch().then((ok) => {
                      if (ok) {
                        setView("game");
                      }
                    });
                  }}
                >
                  Rejoin last match
                </button>
              ) : null}
              <button
                type="button"
                className="home-play-cta auth-session__primary"
                disabled={!socketConnected}
                onClick={() => openQuick(false)}
              >
                Quick match
              </button>
              <button
                type="button"
                className="home-action-secondary auth-button-secondary"
                disabled={!socketConnected}
                onClick={() => openQuick(true)}
              >
                Quick match (timed)
              </button>
              <div className="home-divider" />
              <label className="home-checkbox">
                <input
                  type="checkbox"
                  checked={createTimed}
                  onChange={(e) => setCreateTimed(e.target.checked)}
                />
                Timed room (30s / move)
              </label>
              <button
                type="button"
                className="home-action-secondary auth-button-secondary"
                disabled={!socketConnected}
                onClick={() => void onCreateRoom()}
              >
                Create room
              </button>
              <p className="home-screen__hint">
                Share the match id from logs or second device after create.
              </p>
              <div className="home-join-row">
                <input
                  className="home-join-input"
                  placeholder="Match id to join"
                  value={joinIdInput}
                  onChange={(e) => setJoinIdInput(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="auth-session__primary home-join-btn"
                  disabled={!socketConnected}
                  onClick={() => void onJoinById()}
                >
                  Join
                </button>
              </div>
              <button
                type="button"
                className="home-action-secondary auth-button-secondary"
                onClick={() => setView("leaderboard")}
              >
                Leaderboard
              </button>
            </div>
            {homeBusy ? (
              <p className="home-screen__busy" aria-live="polite">
                {homeBusy}
              </p>
            ) : null}
            {socketError ? (
              <div className="auth-error home-screen__error" role="alert">
                {socketError}{" "}
                <button
                  type="button"
                  className="auth-error__dismiss"
                  onClick={clearSocketError}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {view === "game" ? (
          <TicTacToePanel
            userId={session.user_id ?? ""}
            autoQueueFromHomeToken={gameAutoQueueToken}
            skipAutoMatchmaker={gameEntry.kind === "no_auto"}
            quickMatchTimed={
              gameEntry.kind === "quick" ? gameEntry.timed : false
            }
            onExitToHome={exitGameToHome}
          />
        ) : null}

        {view === "leaderboard" ? (
          <LeaderboardPanel session={session} onBack={() => setView("home")} />
        ) : null}

        {view === "statistics" ? (
          <StatisticsPanel session={session} onBack={() => setView("home")} />
        ) : null}

        {view === "profile" ? (
          <div className="profile-screen">
            <button
              type="button"
              className="auth-button-secondary profile-screen__back"
              onClick={backFromProfile}
            >
              Back
            </button>
            <AccountEditor session={session} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
