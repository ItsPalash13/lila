import { useCallback, useState } from "react";
import { nakamaErrorMessage } from "../nakama/errors";
import { useNakamaAuth } from "./NakamaAuthContext";

function isValidCustomId(id: string): boolean {
  return /^[a-zA-Z0-9-]{6,128}$/.test(id);
}

/**
 * Custom id from your own identity system.
 * @see https://heroiclabs.com/docs/nakama/concepts/authentication/#custom
 */
export function CustomIdAuthForm() {
  const { client, setSession } = useNakamaAuth();
  const [customId, setCustomId] = useState("");
  const [username, setUsername] = useState("");
  const [create, setCreate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmed = customId.trim();
      if (!isValidCustomId(trimmed)) {
        setError(
          "Custom id must be alphanumeric with dashes only, between 6 and 128 characters.",
        );
        return;
      }
      setBusy(true);
      try {
        const session = await client.authenticateCustom(
          trimmed,
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
    [client, create, customId, setSession, username],
  );

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <p className="auth-form__hint">
        For external account systems (e.g. your own user database). Not the same
        as device id length rules.
      </p>
      {error ? <div className="auth-error">{error}</div> : null}
      <label>
        Custom id
        <input
          type="text"
          value={customId}
          onChange={(ev) => setCustomId(ev.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Username (optional)
        <input
          type="text"
          value={username}
          onChange={(ev) => setUsername(ev.target.value)}
          autoComplete="username"
        />
      </label>
      <label className="auth-form__row">
        <input
          type="checkbox"
          checked={create}
          onChange={(ev) => setCreate(ev.target.checked)}
        />
        Create account if the custom id is new
      </label>
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in with custom id"}
      </button>
    </form>
  );
}
