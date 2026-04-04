import { useCallback, useState } from "react";
import { nakamaErrorMessage } from "../nakama/errors";
import { useNakamaAuth } from "./NakamaAuthContext";

type Mode = "register" | "signin";

/**
 * Email + password. Register uses `create: true`; sign-in uses `create: false`.
 * Password must be at least 8 characters.
 * @see https://heroiclabs.com/docs/nakama/concepts/authentication/#email
 */
export function EmailAuthForm() {
  const { client, setSession } = useNakamaAuth();
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmed = email.trim();
      if (!trimmed) {
        setError("Email is required.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      setBusy(true);
      try {
        const create = mode === "register";
        const session = await client.authenticateEmail(
          trimmed,
          password,
          create,
          username.trim() || undefined,
        );
        setSession(session);
      } catch (err) {
        setError(await nakamaErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [client, email, mode, password, setSession, username],
  );

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <div className="auth-tabs" role="tablist" aria-label="Email auth mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => {
            setMode("register");
            setError(null);
          }}
        >
          Register
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
        >
          Sign in
        </button>
      </div>
      {error ? <div className="auth-error">{error}</div> : null}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          minLength={8}
          required
        />
      </label>
      {mode === "register" ? (
        <label>
          Username (optional)
          <input
            type="text"
            value={username}
            onChange={(ev) => setUsername(ev.target.value)}
            autoComplete="username"
          />
        </label>
      ) : null}
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy
          ? "Working…"
          : mode === "register"
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}
