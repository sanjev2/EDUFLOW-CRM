import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResendVerificationForm } from "./resend-verification-form";
import { LoginForm } from "./login-form";
import { ForgotPasswordForm } from "./forgot-reset-forms";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => { navigation.push.mockReset(); vi.restoreAllMocks(); });

describe("verification and recovery email interfaces", () => {
  it("submits a resend request and displays the generic success response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ message: "If the account is eligible, verification instructions will be sent." })));
    render(<ResendVerificationForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send verification instructions" }));
    expect(await screen.findByRole("status")).toHaveTextContent("If the account is eligible");
  });

  it("shows resend loading and a generic error state", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    render(<ResendVerificationForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send verification instructions" }));
    expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
    finish(await response({ error: { message: "The request could not be completed." } }, false, 503));
    expect(await screen.findByRole("alert")).toHaveTextContent("The request could not be completed.");
  });

  it("guides an unverified user to the resend page after blocked login", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ error: { code: "EMAIL_VERIFICATION_REQUIRED", message: "Email verification is required" } }, false, 403)));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password-Test7!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const link = await screen.findByRole("link", { name: "Request a new verification email" });
    expect(link).toHaveAttribute("href", "/resend-verification");
  });

  it("keeps forgot-password confirmation generic", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ message: "If the account exists, password reset instructions will be sent." })));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "unknown@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("If the account exists"));
    expect(screen.getByRole("status")).not.toHaveTextContent("unknown@example.test");
  });
});
