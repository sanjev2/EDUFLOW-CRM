import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const violations = [];
const normalized = (value) => value.replaceAll("\\", "/");

for (const filename of tracked) {
  const name = normalized(filename);
  const lower = name.toLowerCase();
  const forbiddenPath =
    ((lower === ".env" || lower.startsWith(".env.")) && lower !== ".env.example") ||
    lower.startsWith(".runtime/") ||
    (lower.startsWith("uploads/") && lower !== "uploads/.gitkeep") ||
    lower.startsWith("evidence/raw/") ||
    lower.startsWith("evidence/screenshots/") ||
    /\.(?:pem|p12|pfx|key|har|pcap)$/i.test(lower);
  if (forbiddenPath) violations.push({ filename, rule: "forbidden tracked path" });
}

const patterns = [
  { rule: "private key material", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { rule: "GitHub access token", expression: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { rule: "AWS access key", expression: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: "Google API key", expression: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { rule: "SMTP password assignment", files: /(?:^|\/)(?:\.env[^/]*|[^/]+\.(?:ya?ml)|Dockerfile)$/i, expression: /^SMTP_PASSWORD[ \t]*[:=][ \t]*["']?(?!\$\{|<|replace|test|ci-)[^\s"'#]{12,}/im },
];

for (const filename of tracked) {
  if (normalized(filename) === "scripts/check-repository-security.mjs") continue;
  let content;
  try {
    const buffer = readFileSync(path.resolve(filename));
    if (buffer.includes(0)) continue;
    content = buffer.toString("utf8");
  } catch {
    violations.push({ filename, rule: "tracked file unreadable" });
    continue;
  }
  for (const pattern of patterns) {
    if ((!pattern.files || pattern.files.test(normalized(filename))) && pattern.expression.test(content)) violations.push({ filename, rule: pattern.rule });
  }
}

if (violations.length) {
  for (const violation of violations) console.error(`Repository security check failed: ${violation.rule} in ${violation.filename}`);
  process.exit(1);
}
console.log(`Repository security check passed for ${tracked.length} tracked files.`);
