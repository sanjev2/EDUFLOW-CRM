import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configurationSource } from "../src/config.js";

describe("development startup environment", () => {
  it("loads direct workspace development commands from the root environment", () => {
    const root = JSON.parse(readFileSync(path.resolve("..", "package.json"), "utf8")) as { scripts: Record<string, string> };
    const backend = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { scripts: Record<string, string> };
    const frontend = JSON.parse(readFileSync(path.resolve("..", "frontend", "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(root.scripts["dev:frontend"]).toContain("@eduflow/frontend");
    expect(root.scripts["dev:backend"]).toContain("@eduflow/backend");
    expect(frontend.scripts.dev).toContain("dotenv -e ../.env");
    expect(backend.scripts.dev).toContain("dotenv -e ../.env");
    expect(["process environment", "root .env"]).toContain(configurationSource);
  });
});
