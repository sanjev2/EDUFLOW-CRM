import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegisterForm } from "./register-form";

describe("student registration interface", () => {
  it("renders accessible registration fields without a role control", () => {
    render(<RegisterForm />);
    expect(screen.getByRole("heading", { name: /create your student account/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeRequired();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
  });
  it("provides live password-strength feedback and visibility control", () => {
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong-Password7!" } });
    expect(screen.getByText(/✓ 12–128 characters/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Show password" })[0]!);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });
});
