import { useState } from "react";
import "./Auth.css";
import { CustomIdAuthForm } from "./CustomIdAuthForm";
import { DeviceAuthForm } from "./DeviceAuthForm";
import { EmailAuthForm } from "./EmailAuthForm";

type AuthTab = "device" | "email" | "custom";

/**
 * Nakama authentication entry points covered in the official docs.
 * @see https://heroiclabs.com/docs/nakama/concepts/authentication/
 */
export function AuthPanel() {
  const [tab, setTab] = useState<AuthTab>("device");

  return (
    <div className="auth-panel">
      <p className="auth-panel__intro">
        Sign in with Nakama. Choose device (guest-style), email, or a custom id
        from your backend.
      </p>
      <div className="auth-tabs" role="tablist" aria-label="Authentication method">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "device"}
          onClick={() => setTab("device")}
        >
          Device
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "email"}
          onClick={() => setTab("email")}
        >
          Email
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "custom"}
          onClick={() => setTab("custom")}
        >
          Custom
        </button>
      </div>
      {tab === "device" ? <DeviceAuthForm /> : null}
      {tab === "email" ? <EmailAuthForm /> : null}
      {tab === "custom" ? <CustomIdAuthForm /> : null}
    </div>
  );
}
