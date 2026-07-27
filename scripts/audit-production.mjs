import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const reviewDeadline = "2026-08-31";
const approvals = {
  next: {
    nodes: new Set(["node_modules/next"]),
    advisoryIds: new Set(),
    indirect: new Set(["postcss", "sharp"]),
  },
  postcss: {
    nodes: new Set(["node_modules/next/node_modules/postcss"]),
    advisoryIds: new Set([
      "GHSA-qx2v-qp2m-jg93",
      "GHSA-6g55-p6wh-862q",
      "GHSA-r28c-9q8g-f849",
    ]),
    indirect: new Set(),
  },
  sharp: {
    nodes: new Set(["node_modules/sharp"]),
    advisoryIds: new Set(["GHSA-f88m-g3jw-g9cj"]),
    indirect: new Set(),
  },
};

const inputIndex = process.argv.indexOf("--input");
const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
const command = process.platform === "win32" ? process.env.ComSpec : "npm";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd audit --omit=dev --audit-level=high --json"]
    : ["audit", "--omit=dev", "--audit-level=high", "--json"];
const result = inputPath
  ? undefined
  : spawnSync(command, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

let report;
try {
  if (result?.error) throw result.error;
  report = JSON.parse(
    inputPath ? readFileSync(inputPath, "utf8") : (result?.stdout ?? ""),
  );
} catch {
  console.error("Production dependency audit did not return valid JSON.");
  process.exit(1);
}

if (report.error) {
  console.error("Production dependency audit could not complete.");
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const blocking = Object.values(vulnerabilities).filter(
  (item) => item && ["high", "critical"].includes(item.severity),
);

if (!blocking.length) {
  console.log(
    "Production dependency audit passed with no high or critical findings.",
  );
  process.exit(0);
}

if (new Date(`${reviewDeadline}T23:59:59Z`) < new Date()) {
  console.error(`Dependency risk acceptance expired on ${reviewDeadline}.`);
  process.exit(1);
}

const rejected = [];
for (const vulnerability of blocking) {
  const approval = approvals[vulnerability.name];
  if (!approval) {
    rejected.push(`${vulnerability.name}: package is not approved`);
    continue;
  }
  const nodes = vulnerability.nodes ?? [];
  if (!nodes.length || nodes.some((node) => !approval.nodes.has(node))) {
    rejected.push(`${vulnerability.name}: dependency path changed`);
  }
  const advisoryIds = vulnerability.via
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => entry.url?.match(/GHSA-[a-z0-9-]+$/i)?.[0])
    .filter(Boolean);
  if (advisoryIds.some((id) => !approval.advisoryIds.has(id))) {
    rejected.push(`${vulnerability.name}: contains an unapproved advisory`);
  }
  const indirect = vulnerability.via.filter(
    (entry) => typeof entry === "string",
  );
  if (
    indirect.some(
      (name) => !approval.indirect.has(name) || !vulnerabilities[name],
    )
  ) {
    rejected.push(`${vulnerability.name}: dependency chain changed`);
  }
}

if (rejected.length) {
  for (const reason of rejected)
    console.error(`Production dependency audit failed: ${reason}`);
  process.exit(1);
}

console.log(
  `Production dependency audit is not clean: ${blocking.length} high/critical package findings are covered only by the exact reviewed advisories through ${reviewDeadline}.`,
);
