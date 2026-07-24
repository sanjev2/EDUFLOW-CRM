import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("landing page", () => {
  it("removes placeholder and development messaging", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /from first enquiry to successful enrolment/i })).toBeInTheDocument();
    expect(screen.queryByText(/secure foundation in progress/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/a clearer path from enquiry to enrolment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend development|security development/i)).not.toBeInTheDocument();
  });

  it("targets real sections and authentication routes", () => {
    render(<Home />);
    expect(screen.getAllByRole("link", { name: "Product" })[0]).toHaveAttribute("href", "/#product");
    expect(screen.getAllByRole("link", { name: "Workflow" })[0]).toHaveAttribute("href", "/#workflow");
    expect(screen.getAllByRole("link", { name: "Automations" })[0]).toHaveAttribute("href", "/#automations");
    expect(screen.getAllByRole("link", { name: "Security" })[0]).toHaveAttribute("href", "/#security");
    expect(screen.getAllByRole("link", { name: "Sign in" }).every((link) => link.getAttribute("href") === "/login")).toBe(true);
    expect(screen.getAllByRole("link", { name: /get started/i }).every((link) => link.getAttribute("href") === "/register")).toBe(true);
  });

  it("makes mobile navigation keyboard-accessible", () => {
    render(<Home />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Mobile navigation" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Mobile navigation" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not advertise staff registration or unsupported features", () => {
    render(<Home />);
    expect(screen.getByText(/staff accounts are provided by an authorized administrator/i)).toBeInTheDocument();
    expect(screen.queryByText(/register as (an )?(administrator|counsellor)/i)).not.toBeInTheDocument();
    for (const unsupported of [/document upload/i, /payments?/i, /subscriptions?/i, /artificial intelligence/i, /google login/i, /integrations?/i, /pricing/i]) {
      expect(screen.queryByText(unsupported)).not.toBeInTheDocument();
    }
  });

  it("uses honest private-document copy without internal limitation wording", () => {
    render(<Home />);
    expect(screen.queryByText(/without implying private document storage/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Private PDF, JPEG and PNG documents use authenticated downloads and role-aware access/i)).toBeInTheDocument();
    expect(screen.queryByText(/malware scanning|cloud backup|unlimited storage/i)).not.toBeInTheDocument();
  });
});
