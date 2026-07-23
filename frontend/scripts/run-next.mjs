import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);

export function runNext(command) {
  const port = process.env.FRONTEND_PORT ?? "3100";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    process.stderr.write("FRONTEND_PORT must be a valid TCP port.\n");
    process.exit(1);
  }
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), command, "-p", port], {
    stdio: "inherit",
    env: process.env,
  });
  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
