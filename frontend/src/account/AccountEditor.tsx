import { useCallback, useEffect, useState } from "react";
import { Session } from "@heroiclabs/nakama-js";
import { nakamaErrorMessage } from "../nakama/errors";
import { useNakamaAuth } from "../auth/NakamaAuthContext";
import {
  AVATAR_OPTIONS,
  LILA_AVATAR_PREFIX,
  optionMatchingStored,
  resolveAvatarDisplayUrl,
} from "./avatarOptions";
import "./Account.css";

type Props = {
  session: Session;
};

/**
 * Fetch and update the current user via Nakama account APIs.
 * @see https://heroiclabs.com/docs/nakama/concepts/user-accounts/
 */
export function AccountEditor({ session }: Props) {
  const { client, setSession } = useNakamaAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [langTag, setLangTag] = useState("");
  const [timezone, setTimezone] = useState("");
  const [avatarStored, setAvatarStored] = useState<string | undefined>();
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [useCustomAvatar, setUseCustomAvatar] = useState(false);
  const [walletPreview, setWalletPreview] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const account = await client.getAccount(session);
        if (cancelled) {
          return;
        }
        const u = account.user;
        setUsername(u?.username ?? "");
        setDisplayName(u?.display_name ?? "");
        setLocation(u?.location ?? "");
        setLangTag(u?.lang_tag ?? "");
        setTimezone(u?.timezone ?? "");
        const rawAvatar = u?.avatar_url;
        const bundled = optionMatchingStored(rawAvatar);
        if (bundled) {
          setUseCustomAvatar(false);
          setCustomAvatarUrl("");
          setAvatarStored(bundled.stored);
        } else if (rawAvatar) {
          setUseCustomAvatar(true);
          setCustomAvatarUrl(rawAvatar);
          setAvatarStored(undefined);
        } else {
          setUseCustomAvatar(false);
          setCustomAvatarUrl("");
          setAvatarStored(AVATAR_OPTIONS[0]?.stored);
        }
        setWalletPreview(account.wallet);
      } catch (err) {
        if (!cancelled) {
          setLoadError(await nakamaErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, session]);

  const previewImg = resolveAvatarDisplayUrl(
    useCustomAvatar ? customAvatarUrl.trim() : avatarStored,
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaveError(null);
      setSaveOk(false);
      setSaving(true);
      try {
        const avatar_url = useCustomAvatar
          ? customAvatarUrl.trim() || undefined
          : avatarStored;

        await client.updateAccount(session, {
          username: username.trim() || undefined,
          display_name: displayName.trim() || undefined,
          location: location.trim() || undefined,
          lang_tag: langTag.trim() || undefined,
          timezone: timezone.trim() || undefined,
          avatar_url,
        });

        await client.sessionRefresh(session);
        setSession(
          new Session(session.token, session.refresh_token, session.created),
        );
        setSaveOk(true);
      } catch (err) {
        setSaveError(await nakamaErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [
      avatarStored,
      client,
      customAvatarUrl,
      displayName,
      langTag,
      location,
      session,
      setSession,
      timezone,
      useCustomAvatar,
      username,
    ],
  );

  if (loading) {
    return (
      <div className="account-editor">
        <p className="auth-form__hint" style={{ textAlign: "center" }}>
          Loading account…
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="account-editor">
        <div className="auth-error">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="account-editor">
      <h2 className="account-editor__title">Edit profile</h2>
      <p className="account-editor__subtitle">
        Updates your Nakama user account (
        <a
          href="https://heroiclabs.com/docs/nakama/concepts/user-accounts/"
          target="_blank"
          rel="noreferrer"
        >
          docs
        </a>
        ). Username must stay unique on the server.
      </p>

      <div className="account-editor__preview">
        {previewImg ? (
          <img
            className="account-editor__preview-img"
            src={previewImg}
            alt=""
          />
        ) : (
          <div
            className="account-editor__preview-img"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              color: "var(--text)",
            }}
          >
            No image
          </div>
        )}
        <div className="account-editor__preview-meta">
          <p className="account-editor__preview-name">
            {displayName.trim() || username || "Player"}
          </p>
          <p className="account-editor__preview-sub">
            @{username || session.username || "…"}
          </p>
        </div>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        {saveOk ? (
          <div className="account-editor__success">Profile saved.</div>
        ) : null}
        {saveError ? <div className="auth-error">{saveError}</div> : null}

        <p className="account-editor__section-label">Avatar</p>
        <div className="account-editor__avatar-grid">
          {AVATAR_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={
                "account-editor__avatar-btn" +
                (!useCustomAvatar && avatarStored === opt.stored
                  ? " account-editor__avatar-btn--selected"
                  : "")
              }
              onClick={() => {
                setUseCustomAvatar(false);
                setAvatarStored(opt.stored);
                setSaveOk(false);
              }}
              title={opt.id}
              aria-label={`Select avatar ${opt.id}`}
            >
              <img src={opt.url} alt="" />
            </button>
          ))}
        </div>

        <label className="auth-form__row">
          <input
            type="checkbox"
            checked={useCustomAvatar}
            onChange={(ev) => {
              setUseCustomAvatar(ev.target.checked);
              setSaveOk(false);
            }}
          />
          Use custom image URL instead
        </label>
        {useCustomAvatar ? (
          <label className="account-editor__custom-url">
            Avatar URL
            <input
              type="url"
              value={customAvatarUrl}
              onChange={(ev) => setCustomAvatarUrl(ev.target.value)}
              placeholder="https://…"
              autoComplete="off"
            />
          </label>
        ) : null}

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(ev) => setUsername(ev.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(ev) => setDisplayName(ev.target.value)}
            autoComplete="nickname"
          />
        </label>
        <label>
          Location
          <input
            type="text"
            value={location}
            onChange={(ev) => setLocation(ev.target.value)}
            autoComplete="address-level1"
          />
        </label>
        <label>
          Language tag (BCP-47)
          <input
            type="text"
            value={langTag}
            onChange={(ev) => setLangTag(ev.target.value)}
            placeholder="en"
            autoComplete="off"
          />
        </label>
        <label>
          Timezone
          <input
            type="text"
            value={timezone}
            onChange={(ev) => setTimezone(ev.target.value)}
            placeholder="Europe/Stockholm"
            autoComplete="off"
          />
        </label>

        <button className="auth-submit" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>

      {walletPreview ? (
        <div className="account-editor__wallet">
          <strong>Wallet (read-only)</strong> — {walletPreview}
        </div>
      ) : null}

      {AVATAR_OPTIONS.length === 0 ? (
        <p className="auth-form__hint" style={{ marginTop: 16 }}>
          Add image files under <code>src/assets/avatars</code> to enable bundled
          avatars. The <code>{LILA_AVATAR_PREFIX}</code> prefix keeps picks stable
          in the database.
        </p>
      ) : null}
    </div>
  );
}
