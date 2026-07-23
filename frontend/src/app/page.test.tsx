import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("landing page", () => {
  it("renders its main heading and registration link", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /guide every student/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /get started/i })).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: expect.stringContaining("/register") })]),
    );
  });
});
