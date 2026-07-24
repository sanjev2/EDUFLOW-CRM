import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../app-shell";
import { StudentProfileForm } from "./student-profile-form";
import { StudentApplication } from "./student-application";
import { SecurityCenter } from "../auth/security-center";
import { AdminAssignments } from "./admin-assignments";
import { AdminSecurityAlerts } from "./admin-events";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), pathname: "/dashboard/student" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
}));

function response(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.pathname = "/dashboard/student";
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) =>
    response(String(input).includes("/auth/me")
      ? { user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true }
      : {})));
});

describe("EduFlow CRM interface", () => {
  it("renders role-specific student navigation", () => {
    render(<AppShell role="STUDENT" title="Student dashboard"><p>Content</p></AppShell>);
    expect(screen.getAllByRole("link", { name: "My Profile" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Documents" })[0]).toHaveAttribute("href", "/documents");
    expect(screen.getAllByRole("link", { name: "Privacy & data" })[0]).toHaveAttribute("href", "/privacy");
    expect(screen.queryByRole("link", { name: "Audit Logs" })).not.toBeInTheDocument();
  });
  it("renders role-specific administrator navigation", () => {
    navigation.pathname = "/dashboard/admin";
    render(<AppShell role="ADMIN" title="Administrator dashboard"><p>Content</p></AppShell>);
    expect(screen.getAllByRole("link", { name: "Assignments" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Documents" })[0]).toHaveAttribute("href", "/admin/documents");
    expect(screen.getAllByRole("link", { name: "Privacy & data" })[0]).toHaveAttribute("href", "/privacy");
    expect(screen.getAllByRole("link", { name: "Security Alerts" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Dashboard" })[0]).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /collapse sidebar/i })).not.toBeInTheDocument();
  });
  it("redirects unauthenticated and wrong-role dashboard entry", async () => {
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) =>
      String(input).includes("/auth/me")
        ? Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: { code: "AUTHENTICATION_REQUIRED" } }) } as Response)
        : response({})));
    const first = render(<AppShell role="STUDENT" title="Student dashboard"><p>Content</p></AppShell>);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    first.unmount();
    navigation.replace.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => response({ user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true })));
    render(<AppShell role="ADMIN" title="Administrator dashboard"><p>Content</p></AppShell>);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/access-denied"));
  });
  it("redirects an administrator to mandatory MFA enrolment", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ user: { role: "ADMIN", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: false })));
    render(<AppShell role="ADMIN" title="Administrator dashboard"><p>Content</p></AppShell>);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/mfa-enrolment"));
  });
  it("waits for the authoritative ADMIN role before guarding shared security settings", async () => {
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/csrf")) return response({ csrfToken: "test-csrf" });
      if (url.includes("/sessions")) return response({ sessions: [] });
      return response({ user: { role: "ADMIN", status: "ACTIVE", mfaEnabled: true }, passwordExpired: false, mfaComplete: true });
    }));
    render(<SecurityCenter />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your secure workspace");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Security settings" })).toBeInTheDocument());
    expect(navigation.replace).not.toHaveBeenCalledWith("/access-denied");
    expect(screen.getAllByRole("link", { name: "Audit Logs" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set up MFA" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Logout" })).toHaveLength(1);
  });
  it("keeps assignment confirmation disabled until every input is valid", async () => {
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/me")) return response({ user: { role: "ADMIN", status: "ACTIVE", mfaEnabled: true }, passwordExpired: false, mfaComplete: true });
      if (url.includes("/assignments/counsellors")) return response({ counsellors: [{ _id: "c1", fullName: "Counsellor One", email: "c@example.test", assignmentCount: 0 }] });
      if (url.includes("/assignments/unassigned")) return response({ applications: [{ _id: "a1", studentId: { _id: "s1", fullName: "Student One", email: "s@example.test" }, stage: "ENQUIRY" }] });
      return response({});
    }));
    render(<AdminAssignments />);
    const button = await screen.findByRole("button", { name: "Confirm assignment" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Counsellor"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Audit reason"), { target: { value: "too short" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Audit reason"), { target: { value: "Valid audit reason" } });
    expect(button).toBeEnabled();
  });
  it("presents MFA enablement as a positive event instead of a medium warning", async () => {
    const polling = vi.spyOn(window, "setInterval");
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/me")) return response({ user: { role: "ADMIN", status: "ACTIVE", mfaEnabled: true }, passwordExpired: false, mfaComplete: true });
      if (url.includes("/ip-rules")) return response({ rules: [] });
      return response({ alerts: [{ _id: "alert-1", type: "MFA_ENABLED", severity: "MEDIUM", createdAt: new Date().toISOString() }] });
    }));
    render(<AdminSecurityAlerts />);
    expect(await screen.findByText("Protection enabled")).toBeInTheDocument();
    expect(screen.getByText("Multi-factor authentication was enabled successfully.")).toBeInTheDocument();
    expect(screen.queryByText("MEDIUM")).not.toBeInTheDocument();
    expect(screen.getByLabelText("IP address or CIDR")).toBeInTheDocument();
    expect(polling).toHaveBeenCalledWith(expect.any(Function), 30_000);
  });
  it("opens and closes the accessible mobile drawer", () => {
    render(<AppShell role="COUNSELLOR" title="Counsellor dashboard"><p>Content</p></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
  });
  it("renders the sectioned student profile form", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ profile: null, completion: 0 })));
    render(<StudentProfileForm />);
    await waitFor(() => expect(screen.getByText("0%")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Personal information" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Academic information" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Study preferences" })).toBeInTheDocument();
  });
  it("shows the important empty enquiry state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ application: null, history: [], assignment: null })));
    render(<StudentApplication />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Create your first enquiry" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Create enquiry" })).toBeInTheDocument();
  });
  it("renders an application timeline without exposing internal notes", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ application: { _id: "a1", stage: "COUNSELLING" }, assignment: null, history: [{ _id: "h1", newStage: "ENQUIRY", reason: "Student created enquiry", createdAt: new Date().toISOString() }] })));
    render(<StudentApplication />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Stage history" })).toBeInTheDocument());
    expect(screen.getByText("Student created enquiry")).toBeInTheDocument();
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument();
  });
  it("submits with confirmation and shows loading, safe receipt and timestamp", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-1234-1234-123456789abc" });
    let submitted = false;
    const fetchMock = vi.fn((input: string | URL | Request, options?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/me")) return response({ user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true });
      if (url.includes("/auth/csrf")) return response({ csrfToken: "test-csrf" });
      if (url.includes("/applications/current/submit")) {
        submitted = true;
        expect(options?.headers).toMatchObject({ "idempotency-key": "12345678123412341234123456789abc12345678123412341234123456789abc" });
        expect(options?.body).toBe(JSON.stringify({ confirm: true }));
        return response({ receipt: { reference: "EDF-20260724-ABC123", submittedAt: "2026-07-24T10:00:00.000Z", integrity: "a".repeat(64), stage: "APPLICATION_SUBMITTED" } });
      }
      return response({
        application: { _id: "a1", stage: submitted ? "APPLICATION_SUBMITTED" : "DOCUMENTS_PENDING" },
        assignment: null,
        history: [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<StudentApplication />);
    const button = await screen.findByRole("button", { name: "Submit application" });
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "Submitting…" })).toBeDisabled();
    expect(await screen.findByRole("status")).toHaveTextContent("Application submitted securely");
    expect(screen.getByText(/EDF-20260724-ABC123/)).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledOnce();
  });
  it("keeps the application form usable and shows a safe submission error", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-1234-1234-123456789abc" });
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/me")) return response({ user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true });
      if (url.includes("/auth/csrf")) return response({ csrfToken: "test-csrf" });
      if (url.includes("/applications/current/submit")) return Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ error: { code: "APPLICATION_NOT_READY", message: "Complete the required application information." } }) } as Response);
      return response({ application: { _id: "a1", stage: "DOCUMENTS_PENDING" }, assignment: null, history: [] });
    }));
    render(<StudentApplication />);
    fireEvent.click(await screen.findByRole("button", { name: "Submit application" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Complete the required application information.");
    expect(screen.getByRole("button", { name: "Submit application" })).toBeEnabled();
  });
});
