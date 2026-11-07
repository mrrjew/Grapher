"use client";

import { useEffect, useRef, useState } from "react";
import { clearDraft } from "@/lib/graph-draft";

type Mode =
  | "login"
  | "signup"
  | "forgot-password"
  | "resend"
  | "confirm"
  | "reset-password"
  | "change-password"
  | "delete-account"
  | "logout";
const labels: Record<Mode, string> = {
  login: "Log in",
  signup: "Create account",
  "forgot-password": "Send reset link",
  resend: "Send verification link",
  confirm: "Continue",
  "reset-password": "Set new password",
  "change-password": "Change password",
  "delete-account": "Delete my account",
  logout: "Log out",
};

export function AuthForm({
  mode,
  tokenHash,
  tokenType,
  disabled = false,
  draftUserId,
}: {
  mode: Mode;
  tokenHash?: string;
  tokenType?: string;
  disabled?: boolean;
  draftUserId?: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const messageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const email = ["login", "signup", "forgot-password", "resend"].includes(mode);
  const newPassword = ["signup", "reset-password", "change-password"].includes(
    mode,
  );
  const currentPassword = ["change-password", "delete-account"].includes(mode);
  const id = (name: string) => `${mode}-${name}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (tokenHash) values.token_hash = tokenHash;
    if (tokenType) values.type = tokenType;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (result.redirect && (response.ok || response.status === 401)) {
        if (
          response.ok &&
          draftUserId &&
          [
            "logout",
            "delete-account",
            "change-password",
            "reset-password",
          ].includes(mode)
        )
          clearDraft(draftUserId);
        window.location.assign(result.redirect);
        return;
      }
      setFailed(!response.ok);
      setMessage(
        result.message ||
          "We could not complete this request. Please try again.",
      );
      if (result.cooldown || response.status === 429)
        setCooldown(result.cooldown || 60);
      if (response.ok) form.reset();
    } catch {
      setFailed(true);
      setMessage(
        "The connection took too long. Check your connection and try again. If you requested an email, check your inbox before sending another.",
      );
    } finally {
      setPending(false);
      setTimeout(() => messageRef.current?.focus(), 0);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={mode === "logout" ? "logout-form" : "auth-form"}
      aria-busy={pending}
    >
      {email && (
        <div className="field">
          <label htmlFor={id("email")}>Email address</label>
          <input
            id={id("email")}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      )}
      {currentPassword && (
        <div className="field">
          <label htmlFor={id("currentPassword")}>Current password</label>
          <input
            id={id("currentPassword")}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </div>
      )}
      {(mode === "login" || newPassword) && (
        <div className="field">
          <label htmlFor={id("password")}>
            {newPassword && mode !== "signup" ? "New password" : "Password"}
          </label>
          <input
            id={id("password")}
            name="password"
            type="password"
            autoComplete={newPassword ? "new-password" : "current-password"}
            minLength={newPassword ? 12 : undefined}
            maxLength={128}
            pattern={
              newPassword
                ? "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}"
                : undefined
            }
            aria-describedby={newPassword ? id("rules") : undefined}
            required
          />
          {newPassword && (
            <p className="hint" id={id("rules")}>
              Use 12–128 characters, with an uppercase letter, a lowercase
              letter and a number.
            </p>
          )}
        </div>
      )}
      {newPassword && (
        <div className="field">
          <label htmlFor={id("confirmPassword")}>Confirm password</label>
          <input
            id={id("confirmPassword")}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
      )}
      {mode === "delete-account" && (
        <>
          <p>
            Your account will be permanently deleted. This cannot be undone.
          </p>
          <div className="field">
            <label htmlFor={id("confirmation")}>Type DELETE to confirm</label>
            <input
              id={id("confirmation")}
              name="confirmation"
              autoComplete="off"
              pattern="DELETE"
              required
            />
          </div>
        </>
      )}
      <button
        className={
          mode === "delete-account"
            ? "button danger"
            : mode === "logout"
              ? "button secondary"
              : "button"
        }
        type="submit"
        disabled={pending || disabled || cooldown > 0}
      >
        {pending
          ? "Please wait…"
          : cooldown > 0
            ? `Try again in ${cooldown}s`
            : labels[mode]}
      </button>
      {message && (
        <p
          ref={messageRef}
          tabIndex={-1}
          role={failed ? "alert" : "status"}
          className={`message ${failed ? "error-message" : ""}`}
        >
          {message}
        </p>
      )}
      <noscript>
        <p>Enable JavaScript to use the secure account forms.</p>
      </noscript>
    </form>
  );
}
