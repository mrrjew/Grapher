import { describe, expect, it } from "vitest";
import { authFieldErrors } from "@/lib/validation";

describe("inline account field rules", () => {
  it("accepts the same normalized email and legacy login passwords as the server", () => {
    expect(
      authFieldErrors("login", { email: " Student@Lab.edu ", password: "old" }),
    ).toEqual({});
  });
  it("requires fields appropriate to the selected form", () => {
    expect(Object.keys(authFieldErrors("signup", {}))).toEqual([
      "email",
      "password",
      "confirmPassword",
    ]);
    expect(Object.keys(authFieldErrors("change-password", {}))).toEqual([
      "currentPassword",
      "password",
      "confirmPassword",
    ]);
    expect(authFieldErrors("logout", {})).toEqual({});
    expect(authFieldErrors("confirm", {})).toEqual({});
  });
  it("rechecks confirmation when either password changes", () => {
    const values = {
      email: "student@lab.edu",
      password: "GoodPassword123",
      confirmPassword: "GoodPassword123",
    };
    expect(authFieldErrors("signup", values)).toEqual({});
    expect(
      authFieldErrors("signup", { ...values, password: "OtherPassword123" }),
    ).toHaveProperty("confirmPassword");
    expect(
      authFieldErrors("signup", { ...values, password: "weak" }),
    ).toHaveProperty("password");
  });
  it("checks deletion confirmation exactly and requires a current password", () => {
    expect(
      authFieldErrors("delete-account", {
        confirmation: "delete",
        currentPassword: "",
      }),
    ).toHaveProperty("confirmation");
    expect(
      authFieldErrors("delete-account", {
        confirmation: "DELETE",
        currentPassword: "old",
      }),
    ).toEqual({});
  });
});
