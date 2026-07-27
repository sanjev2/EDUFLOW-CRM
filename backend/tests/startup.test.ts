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
  it("separates localhost container development from HTTPS production configuration", () => {
    const localCompose = readFileSync(path.resolve("..", "compose.yaml"), "utf8");
    const productionOverlay = readFileSync(path.resolve("..", "compose.production.yaml"), "utf8");
    expect(localCompose).toContain("NODE_ENV: development");
    expect(localCompose).toContain("FRONTEND_URL: http://localhost:3100");
    expect(localCompose).toContain("PUBLIC_APP_URL: http://localhost:3100");
    expect(productionOverlay).toContain("NODE_ENV: production");
    expect(productionOverlay).toContain("FRONTEND_URL: ${FRONTEND_URL:?");
    expect(productionOverlay).toContain("PUBLIC_APP_URL: ${PUBLIC_APP_URL:?");
    expect(productionOverlay).toContain("NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:?");
    expect(productionOverlay).not.toMatch(/https?:\/\/localhost/);
  });
});
