import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentWorkspace } from "./document-workspace";

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body), blob: () => Promise.resolve(new Blob(["file"])) } as Response);
}

const documentItem = { id: "d1", ownerId: "s1", category: "PASSPORT", originalFilename: "passport.pdf", detectedMimeType: "application/pdf", size: 1200, status: "AVAILABLE", createdAt: new Date().toISOString() };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/applications/current")) return response({ application: null });
    return response({ documents: [] });
  }));
});

describe("private document workspace", () => {
  it("shows the file policy and useful loading and empty states", async () => {
    render(<DocumentWorkspace role="STUDENT" />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    expect(screen.getByText("Loading private documents…")).toBeInTheDocument();
    expect(screen.getByText(/PDF, JPEG or PNG only. Maximum 5 MB/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeInTheDocument();
  });

  it("shows client validation feedback for an invalid file", async () => {
    render(<DocumentWorkspace role="STUDENT" />);
    await screen.findByRole("heading", { name: "No documents yet" });
    const input = screen.getByLabelText("Select file");
    fireEvent.change(input, { target: { files: [new File(["<html>"], "unsafe.html", { type: "text/html" })] } });
    fireEvent.submit(screen.getByRole("button", { name: "Upload" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(/non-empty file|PDF, JPEG or PNG/i);
  });

  it("clears an earlier validation error after a successful OTHER screenshot upload", async () => {
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, options?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/csrf")) return response({ csrfToken: "test-csrf" });
      if (url.includes("/documents") && options?.method === "POST") return response({ document: documentItem }, true, 201);
      if (url.includes("/applications/current")) return response({ application: null });
      return response({ documents: [] });
    }));
    render(<DocumentWorkspace role="STUDENT" />);
    await screen.findByRole("heading", { name: "No documents yet" });
    const input = screen.getByLabelText("Select file");
    const form = screen.getByRole("button", { name: "Upload" }).closest("form")!;
    fireEvent.change(input, { target: { files: [new File(["bad"], "unsafe.html", { type: "text/html" })] } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Document category"), { target: { value: "OTHER" } });
    fireEvent.change(input, { target: { files: [new File(["png"], "screenshot.png", { type: "image/png" })] } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.submit(form);
    expect(await screen.findByRole("status")).toHaveTextContent("Document uploaded securely.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("renders role-appropriate actions without a public file URL", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ documents: [documentItem] })));
    const counsellor = render(<DocumentWorkspace role="COUNSELLOR" studentId="s1" />);
    expect(await screen.findByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(counsellor.container.querySelector("a[href]")).toBeNull();
    counsellor.unmount();

    render(<DocumentWorkspace role="ADMIN" />);
    expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText(/Student ID: s1/i)).toBeInTheDocument();
  });

  it("requires destructive deletion confirmation and exposes API errors safely", async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, _options?: RequestInit) => {
      void _input; void _options;
      return response({ documents: [documentItem] });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DocumentWorkspace role="ADMIN" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === "DELETE")).toBe(false);

    fetchMock.mockImplementationOnce(() => response({ error: { message: "Documents could not be loaded." } }, false, 500));
    render(<DocumentWorkspace role="COUNSELLOR" studentId="s2" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Documents could not be loaded.");
  });
});
