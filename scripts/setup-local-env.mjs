import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(".env");
if (existsSync(target)) {
  process.stdout.write("Existing .env preserved.\n");
  process.exit(0);
}
const template = readFileSync(resolve(".env.example"), "utf8");
const secret = () => randomBytes(48).toString("base64url");
const output = template
  .replace("replace-with-a-long-random-value", secret())
  .replace("replace-with-a-long-random-value", secret())
  .replace("replace-with-a-long-random-value", secret());
writeFileSync(target, output, { encoding: "utf8", mode: 0o600, flag: "wx" });
process.stdout.write("Created local .env with cryptographically generated development secrets.\n");
