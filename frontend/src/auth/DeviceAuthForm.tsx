import { useCallback, useMemo, useState } from "react";
import { nakamaErrorMessage } from "../nakama/errors";
import {
  getOrCreateWebDeviceId,
  isValidDeviceId,
  resetStoredDeviceId,
} from "../nakama/deviceId";
import { useNakamaAuth } from "./NakamaAuthContext";

/**
 * Device auth: frictionless id; set `create` true to register new users.
 * @see https://heroiclabs.com/docs/nakama/concepts/authentication/#device
 */
export function DeviceAuthForm() {
  const { client, setSession } = useNakamaAuth();
  const initialId = useMemo(() => getOrCreateWebDeviceId(), []);
  const [deviceId, setDeviceId] = useState(initialId);
  const [username, setUsername] = useState("");
  const [create, setCreate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!isValidDeviceId(deviceId.trim())) {
        setError(
          "Device id must be alphanumeric with dashes only, between 10 and 128 characters.",
        );
        return;
      }
      setBusy(true);
      try {
        const session = await client.authenticateDevice(
          deviceId.trim(),
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
    [client, create, deviceId, setSession, username],
  );

  const regenerate = useCallback(() => {
    resetStoredDeviceId();
    setDeviceId(getOrCreateWebDeviceId());
    setError(null);
  }, []);

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <p className="auth-form__hint">
        Uses a persisted browser id (UUID). On native apps, use the platform
        device API instead.
      </p>
      {error ? <div className="auth-error">{error}</div> : null}
      <label>
        Device id
        <input
          type="text"
          value={deviceId}
          onChange={(ev) => setDeviceId(ev.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="button" className="auth-button-secondary" onClick={regenerate}>
        New random id
      </button>
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
        Create account if the device id is new
      </label>
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in with device"}
      </button>
    </form>
  );
}
