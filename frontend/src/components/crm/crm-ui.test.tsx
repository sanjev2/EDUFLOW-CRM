import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../app-shell";
import { StudentProfileForm } from "./student-profile-form";
import { StudentApplication } from "./student-application";
import { SecurityCenter } from "../auth/security-center";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/student",
  useRouter: () => navigation,
}));

function response(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  navigation.replace.mockReset();
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) =>
    response(String(input).includes("/auth/me")
      ? { user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true }
      : {})));
});

describe("EduFlow CRM interface", () => {
  it("renders role-specific student navigation", () => {
    render(<AppShell role="STUDENT" title="Student dashboard"><p>Content</p></AppShell>);
    expect(screen.getAllByRole("link", { name: "My Profile" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Audit Logs" })).not.toBeInTheDocument();
  });
  it("renders role-specific administrator navigation", () => {
    render(<AppShell role="ADMIN" title="Administrator dashboard"><p>Content</p></AppShell>);
    expect(screen.getAllByRole("link", { name: "Assignments" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Security Alerts" }).length).toBeGreaterThan(0);
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
});
