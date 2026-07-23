import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("landing page", () => {
  it("renders its main heading and registration link", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /clearer path/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/register");
  });
});
