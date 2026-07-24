import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyCenter } from "./privacy-center";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), pathname: "/privacy" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
}));

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body), blob: () => Promise.resolve(new Blob([JSON.stringify(body)])) } as Response);
}

beforeEach(() => {
  navigation.replace.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => response({ user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true })));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:private-export") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

describe("privacy data controls", () => {
  it("offers a private export without rendering a public download URL", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/privacy/export")) return response({ schemaVersion: "1.0", account: { role: "STUDENT" } });
      return response({ user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true });
    }));
    render(<PrivacyCenter />);
    fireEvent.click(await screen.findByRole("button", { name: "Download my data" }));
    expect(await screen.findByRole("status")).toHaveTextContent("downloaded");
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-export");
    expect(click).toHaveBeenCalled();
    expect(document.querySelector('a[href^="http"]')).toBeNull();
  });

  it("previews and confirms a strict student profile import without browser storage", async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, options?: RequestInit) => {
      const url = String(input); requests.push({ url, body: options?.body as string | undefined });
      if (url.includes("/auth/csrf")) return response({ csrfToken: "test-csrf" });
      if (url.includes("/privacy/import/preview")) return response({ schemaVersion: "1.0", fields: ["city", "country"], fieldCount: 2, confirmationRequired: true });
      if (url.endsWith("/privacy/import")) return response({ message: "Profile data imported successfully." });
      return response({ user: { role: "STUDENT", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true });
    }));
    render(<PrivacyCenter />);
    const file = new File(["profile"], "profile.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve('{"schemaVersion":"1.0","profile":{"city":"Kathmandu","country":"Nepal","englishTestType":"NONE"}}') });
    fireEvent.change(await screen.findByLabelText("Profile JSON file"), { target: { files: [file] } });
    const previewButton = screen.getByRole("button", { name: "Preview import" });
    await waitFor(() => expect(previewButton).toBeEnabled());
    fireEvent.click(previewButton);
    expect(await screen.findByRole("heading", { name: "Import preview" })).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm import" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    expect(await screen.findByRole("status")).toHaveTextContent("imported successfully");
    const importRequest = requests.find((request) => request.url.endsWith("/privacy/import"));
    expect(JSON.parse(importRequest!.body!)).toMatchObject({ confirm: true, schemaVersion: "1.0", profile: { city: "Kathmandu" } });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("rejects oversized and malformed files before preview", async () => {
    render(<PrivacyCenter />);
    const input = await screen.findByLabelText("Profile JSON file");
    const oversized = new File([new Uint8Array(100 * 1024 + 1)], "large.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("100 KB or smaller");
    const malformed = new File(["bad"], "bad.json", { type: "application/json" });
    Object.defineProperty(malformed, "text", { value: () => Promise.resolve("{bad") });
    fireEvent.change(input, { target: { files: [malformed] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("valid JSON");
  });

  it("keeps profile import unavailable to staff roles", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ user: { role: "COUNSELLOR", status: "ACTIVE", mfaEnabled: false }, passwordExpired: false, mfaComplete: true })));
    render(<PrivacyCenter />);
    expect(await screen.findByRole("button", { name: "Download my data" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Profile JSON file")).not.toBeInTheDocument();
  });
});
