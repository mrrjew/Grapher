export class InputError extends Error {}

export function emailValue(value: unknown): string {
  if (typeof value !== "string")
    throw new InputError("Enter your email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new InputError("Enter a valid email address.");
  return email;
}

export function passwordValue(value: unknown, strong = true): string {
  if (typeof value !== "string" || !value)
    throw new InputError("Enter your password.");
  if (value.length > 128) throw new InputError("Choose a shorter password.");
  if (
    strong &&
    (value.length < 8 ||
      !/[a-z]/.test(value) ||
      !/[A-Z]/.test(value) ||
      !/[0-9]/.test(value))
  )
    throw new InputError(
      "Use at least 8 characters, with an uppercase letter, a lowercase letter and a number.",
    );
  return value;
}

export function confirmationValues(data: Record<string, unknown>) {
  if (
    typeof data.token_hash !== "string" ||
    !/^[a-f0-9]{32,256}$/i.test(data.token_hash) ||
    !["email", "recovery"].includes(String(data.type))
  )
    throw new InputError("This email link is incomplete. Request a new link.");
  return {
    token_hash: data.token_hash,
    type: data.type as "email" | "recovery",
  };
}

export function sameOrigin(origin: string | null, expected: string) {
  return origin === expected;
}

export type AuthMode =
  | "login"
  | "signup"
  | "forgot-password"
  | "resend"
  | "confirm"
  | "reset-password"
  | "change-password"
  | "delete-account"
  | "logout";

/** Shared rules for inline form feedback. Server endpoints still enforce these rules independently. */
export function authFieldErrors(
  mode: AuthMode,
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (field: string, validate: () => unknown) => {
    try {
      validate();
    } catch (error) {
      errors[field] = (error as Error).message;
    }
  };
  if (["login", "signup", "forgot-password", "resend"].includes(mode)) {
    check("email", () => emailValue(values.email));
  }
  if (["change-password", "delete-account"].includes(mode)) {
    check("currentPassword", () => {
      if (!values.currentPassword)
        throw new InputError("Enter your current password.");
      return passwordValue(values.currentPassword, false);
    });
  }
  const newPassword = ["signup", "reset-password", "change-password"].includes(
    mode,
  );
  if (mode === "login" || newPassword) {
    check("password", () => {
      if (!values.password) throw new InputError("Enter your password.");
      return passwordValue(values.password, newPassword);
    });
  }
  if (newPassword) {
    if (!values.confirmPassword)
      errors.confirmPassword = "Confirm your password.";
    else if (values.password !== values.confirmPassword)
      errors.confirmPassword = "The passwords do not match.";
  }
  if (mode === "delete-account" && values.confirmation !== "DELETE")
    errors.confirmation = "Type DELETE to confirm account deletion.";
  return errors;
}
