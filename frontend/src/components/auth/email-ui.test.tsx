import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResendVerificationForm } from "./resend-verification-form";
import { LoginForm } from "./login-form";
import { ForgotPasswordForm, ResetPasswordForm } from "./forgot-reset-forms";
import { VerifyEmailResult } from "./verify-email-result";
import { AcceptCounsellorInvitation } from "./accept-counsellor-invitation";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: new Map<string, string>() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => ({ get: (key: string) => navigation.params.get(key) ?? null }),
}));

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.params.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

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

  it("recovers a stale authenticated CSRF state once and completes login", async () => {
    let loginAttempts = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/csrf")) return response({ csrfToken: "refreshed-csrf" });
      if (url.includes("/auth/login")) {
        loginAttempts += 1;
        if (loginAttempts === 1) return response({ error: { code: "CSRF_REJECTED", message: "CSRF token is missing or invalid" } }, false, 403);
        return response({ user: { role: "STUDENT" }, csrfToken: "new-session-csrf" });
      }
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password-Test7!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/dashboard/student"));
    expect(loginAttempts).toBe(2);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/csrf"))).toHaveLength(1);
  });

  it("does not retry CSRF recovery indefinitely and replaces technical wording", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/csrf")) return response({ csrfToken: "refreshed-csrf" });
      return response({ error: { code: "CSRF_REJECTED", message: "CSRF token is missing or invalid" } }, false, 403);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password-Test7!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("secure sign-in session could not be refreshed");
    expect(screen.getByRole("alert")).not.toHaveTextContent("CSRF token");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/login"))).toHaveLength(2);
  });

  it("keeps forgot-password confirmation generic", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ message: "If the account exists, password reset instructions will be sent." })));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "unknown@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("If the account exists"));
    expect(screen.getByRole("status")).not.toHaveTextContent("unknown@example.test");
  });

  it("navigates safely to login after a successful password reset", async () => {
    navigation.params.set("token", "single-use-reset-token");
    vi.stubGlobal("fetch", vi.fn(() => response({ message: "Password reset successfully." })));
    const history = vi.spyOn(window.history, "replaceState");
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New-Password-Test7!" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "New-Password-Test7!" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?success=password-reset"));
    expect(history).toHaveBeenCalledWith({}, "", "/reset-password");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("does not redirect failed or expired reset tokens as success", async () => {
    navigation.params.set("token", "expired-reset-token");
    vi.stubGlobal("fetch", vi.fn(() => response({ error: { message: "The reset link is invalid or expired." } }, false, 400)));
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New-Password-Test7!" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "New-Password-Test7!" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or expired");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("offers sign in and automatically redirects after successful verification", async () => {
    navigation.params.set("token", "single-use-verification-token");
    vi.stubGlobal("fetch", vi.fn(() => response({ message: "Email verified successfully." })));
    const history = vi.spyOn(window.history, "replaceState");
    render(<VerifyEmailResult />);
    const link = await screen.findByRole("link", { name: "Continue to sign in" });
    expect(link).toHaveAttribute("href", "/login?success=email-verified");
    expect(history).toHaveBeenCalledWith({}, "", "/verify-email");
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?success=email-verified"), { timeout: 2000 });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps invalid verification tokens on the failure and resend pathway", async () => {
    navigation.params.set("token", "expired-verification-token");
    vi.stubGlobal("fetch", vi.fn(() => response({ error: { message: "The verification link is invalid or expired." } }, false, 400)));
    render(<VerifyEmailResult />);
    expect(await screen.findByRole("status")).toHaveTextContent("invalid or expired");
    expect(screen.queryByRole("link", { name: "Continue to sign in" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "new verification email" })).toHaveAttribute("href", "/resend-verification");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["password-reset", "Password reset successful. Sign in with your new password."],
    ["email-verified", "Email verified successfully. You can now sign in."],
  ])("shows the fixed %s login confirmation", (success, expected) => {
    navigation.params.set("success", success);
    render(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent(expected);
  });

  it("never renders arbitrary query text or follows an external destination", () => {
    navigation.params.set("success", "<img src=x onerror=alert(1)>");
    navigation.params.set("message", "Attacker-controlled message");
    navigation.params.set("redirect", "https://example.test/phishing");
    render(<LoginForm />);
    expect(screen.queryByText("Attacker-controlled message")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("verifies a counsellor invitation and securely completes password setup", async () => {
    navigation.params.set("verification", "single-use-verification-token");
    navigation.params.set("setup", "single-use-password-setup-token");
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/verify-email")) return response({ message: "Email verified successfully." });
      if (url.includes("/reset-password")) return response({ message: "Password reset successfully." });
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AcceptCounsellorInvitation />);
    expect(await screen.findByText(/Email verified\. Set your password/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Counsellor-Setup9!" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "Counsellor-Setup9!" } });
    fireEvent.click(screen.getByRole("button", { name: "Set password and continue" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login?success=password-reset"));
    expect(window.location.search).toBe("");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("routes an authenticated counsellor to the counsellor dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ user: { role: "COUNSELLOR" }, csrfToken: "test-csrf" })));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "counsellor@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Counsellor-Setup9!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/dashboard/counsellor"));
  });
});
