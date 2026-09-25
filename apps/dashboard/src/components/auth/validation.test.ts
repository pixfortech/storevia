import { describe, expect, it } from "vitest";
import {
  EMAIL_RULES,
  formEntries,
  newPasswordRules,
  SIGN_IN_RULES,
  signUpRules,
  validateFields,
} from "./validation";

describe("validateFields", () => {
  it("reports each empty required field", () => {
    expect(validateFields({ email: "", password: "" }, SIGN_IN_RULES)).toEqual({
      email: "Enter your email address.",
      password: "Enter your password.",
    });
  });

  it("treats missing and whitespace-only values as empty", () => {
    expect(validateFields({ email: "   " }, SIGN_IN_RULES)).toEqual({
      email: "Enter your email address.",
      password: "Enter your password.",
    });
  });

  it("stops at the first failing rule for a field", () => {
    expect(validateFields({ email: "not-an-email" }, EMAIL_RULES)).toEqual({
      email: "Enter a valid email address.",
    });
  });

  it("accepts a valid sign-in", () => {
    expect(validateFields({ email: " Ana@Example.test ", password: "x" }, SIGN_IN_RULES)).toEqual(
      {},
    );
  });

  it("never checks a sign-in password's length (the server doesn't either)", () => {
    expect(validateFields({ email: "a@b.co", password: "short" }, SIGN_IN_RULES)).toEqual({});
  });

  it("applies the password minimum on sign-up", () => {
    const rules = signUpRules(10);
    expect(validateFields({ name: "Ana", email: "a@b.co", password: "123456789" }, rules)).toEqual({
      password: "Use at least 10 characters.",
    });
    expect(validateFields({ name: "Ana", email: "a@b.co", password: "1234567890" }, rules)).toEqual(
      {},
    );
    expect(validateFields({ name: " ", email: "", password: "" }, rules)).toEqual({
      name: "Enter your name.",
      email: "Enter your email address.",
      password: "Choose a password.",
    });
  });

  it("counts spaces in passwords (they are not trimmed)", () => {
    expect(
      validateFields({ name: "Ana", email: "a@b.co", password: "          " }, signUpRules(10)),
    ).toEqual({ password: "Choose a password." });
    expect(
      validateFields({ name: "Ana", email: "a@b.co", password: " a long one " }, signUpRules(10)),
    ).toEqual({});
  });

  it("requires the new password twice, matching", () => {
    const rules = newPasswordRules(10);
    expect(validateFields({ password: "a long password", confirmPassword: "" }, rules)).toEqual({
      confirmPassword: "Enter the new password again.",
    });
    expect(
      validateFields({ password: "a long password", confirmPassword: "a long passwrod" }, rules),
    ).toEqual({ confirmPassword: "Passwords don't match." });
    expect(
      validateFields({ password: "a long password", confirmPassword: "a long password" }, rules),
    ).toEqual({});
  });
});

describe("formEntries", () => {
  it("keeps string entries only", () => {
    const data = new FormData();
    data.set("email", "a@b.co");
    data.set("file", new Blob(["x"]));
    expect(formEntries(data)).toEqual({ email: "a@b.co" });
  });
});
