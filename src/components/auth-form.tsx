"use client";

import { useEffect, useRef, useState } from "react";
import { clearDraft } from "@/lib/graph-draft";
import { authFieldErrors, type AuthMode } from "@/lib/validation";

type Mode = AuthMode;
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
  const [visiblePasswords, setVisiblePasswords] = useState<
    Record<string, boolean>
  >({});
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const touched = useRef(new Set<string>());
  const submitted = useRef(false);
  const resetting = useRef(false);
  useEffect(() => {
    if (message && !pending) {
      messageRef.current?.focus();
      resetting.current = false;
    }
  }, [message, pending]);
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
  function passwordInput(
    name: string,
    options: React.InputHTMLAttributes<HTMLInputElement>,
  ) {
    const visible = Boolean(visiblePasswords[name]);
    const label =
      name === "currentPassword"
        ? "current password"
        : name === "confirmPassword"
          ? "confirm password"
          : newPassword && mode !== "signup"
            ? "new password"
            : "password";
    return (
      <div className="password-input">
        <input
          id={id(name)}
          name={name}
          {...options}
          type={visible ? "text" : "password"}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={`${visible ? "Hide" : "Show"} ${label}`}
          aria-controls={id(name)}
          aria-pressed={visible}
          onClick={() =>
            setVisiblePasswords((previous) => ({
              ...previous,
              [name]: !previous[name],
            }))
          }
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    );
  }

  function validateFields(form: HTMLFormElement, all = false) {
    const errors = authFieldErrors(
      mode,
      Object.fromEntries(new FormData(form)),
    );
    setFieldErrors(
      Object.fromEntries(
        Object.entries(errors).filter(
          ([name]) => all || submitted.current || touched.current.has(name),
        ),
      ),
    );
    return errors;
  }

  function fieldChanged(
    event: React.FormEvent<HTMLFormElement> | React.FocusEvent<HTMLFormElement>,
  ) {
    const input = event.target;
    if (resetting.current) return;
    if (!(input instanceof HTMLInputElement) || !input.name) return;
    touched.current.add(input.name);
    validateFields(event.currentTarget);
    if (event.type === "change") setMessage("");
  }

  function feedback(name: string) {
    return fieldErrors[name] ? (
      <p className="field-error" id={id(`${name}-error`)} aria-live="polite">
        {fieldErrors[name]}
      </p>
    ) : null;
  }

  function accessibility(name: string, help?: string) {
    return {
      "aria-invalid": Boolean(fieldErrors[name]),
      "aria-describedby":
        [help, fieldErrors[name] ? id(`${name}-error`) : undefined]
          .filter(Boolean)
          .join(" ") || undefined,
    };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    submitted.current = true;
    const errors = validateFields(form, true);
    if (Object.keys(errors).length) {
      (
        form.elements.namedItem(
          Object.keys(errors)[0],
        ) as HTMLInputElement | null
      )?.focus();
      return;
    }
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
      if (response.ok) {
        resetting.current = true;
        form.reset();
        setVisiblePasswords({});
        setFieldErrors({});
        touched.current.clear();
        submitted.current = false;
      }
    } catch {
      setFailed(true);
      setMessage(
        "The connection took too long. Check your connection and try again. If you requested an email, check your inbox before sending another.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onChange={fieldChanged}
      onBlur={fieldChanged}
      noValidate
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
            {...accessibility("email")}
          />
          {feedback("email")}
        </div>
      )}
      {currentPassword && (
        <div className="field">
          <label htmlFor={id("currentPassword")}>Current password</label>
          {passwordInput("currentPassword", {
            autoComplete: "current-password",
            maxLength: 128,
            required: true,
            ...accessibility("currentPassword"),
          })}
          {feedback("currentPassword")}
        </div>
      )}
      {(mode === "login" || newPassword) && (
        <div className="field">
          <label htmlFor={id("password")}>
            {newPassword && mode !== "signup" ? "New password" : "Password"}
          </label>
          {passwordInput("password", {
            autoComplete: newPassword ? "new-password" : "current-password",
            minLength: newPassword ? 8 : undefined,
            maxLength: 128,
            pattern: newPassword
              ? "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,128}"
              : undefined,
            ...accessibility("password", newPassword ? id("rules") : undefined),
            required: true,
          })}
          {feedback("password")}
          {newPassword && (
            <p className="hint" id={id("rules")}>
              Use at least 8 characters, with an uppercase letter, a lowercase
              letter and a number.
            </p>
          )}
        </div>
      )}
      {newPassword && (
        <div className="field">
          <label htmlFor={id("confirmPassword")}>Confirm password</label>
          {passwordInput("confirmPassword", {
            autoComplete: "new-password",
            minLength: 8,
            maxLength: 128,
            required: true,
            ...accessibility("confirmPassword"),
          })}
          {feedback("confirmPassword")}
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
              {...accessibility("confirmation")}
            />
            {feedback("confirmation")}
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
