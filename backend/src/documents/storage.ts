import { createHash, randomBytes } from "node:crypto";
import { mkdir, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { ApiError } from "../errors.js";

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const allowed = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
} as const;
type AllowedExtension = keyof typeof allowed;

function contained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function uploadRoot() {
  await mkdir(config.UPLOAD_ROOT, { recursive: true });
  const rootStat = await lstat(config.UPLOAD_ROOT);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new ApiError(500, "DOCUMENT_STORAGE_ERROR", "The document storage root is invalid");
  return realpath(config.UPLOAD_ROOT);
}

export function validateFilename(value: string) {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "The selected file name is not allowed"); }
  const hasControlCharacter = Array.from(decoded).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!decoded || decoded.length > 180 || hasControlCharacter || decoded !== path.basename(decoded) || /[\\/]/.test(decoded)) {
    throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "The selected file name is not allowed");
  }
  const parts = decoded.split(".");
  const rawExtension = parts[1];
  if (parts.length !== 2 || !parts[0] || !rawExtension || !/^[a-z0-9]+$/i.test(rawExtension)) {
    throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "Double extensions and malformed file names are not allowed");
  }
  const extension = rawExtension.toLowerCase() as AllowedExtension;
  if (!(extension in allowed)) throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "Only PDF, JPEG and PNG files are allowed");
  return { originalFilename: decoded, extension, expectedMime: allowed[extension] };
}

function detect(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    const hasIhdr = buffer.length >= 33 && buffer.subarray(12, 16).toString("ascii") === "IHDR";
    const hasIend = buffer.length >= 12 && buffer.subarray(-8, -4).toString("ascii") === "IEND";
    if (hasIhdr && hasIend) return "image/png" as const;
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9) return "image/jpeg" as const;
  if (buffer.length >= 12 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    const tail = buffer.subarray(Math.max(0, buffer.length - 1024)).toString("latin1").trimEnd();
    if (tail.endsWith("%%EOF")) return "application/pdf" as const;
  }
  throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "The file content does not match an allowed PDF, JPEG or PNG format");
}

export function validateFile(buffer: Buffer, declaredMime: string, filename: string) {
  if (!buffer.length) throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "Empty files are not allowed");
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new ApiError(413, "DOCUMENT_TOO_LARGE", "Files must be 5 MB or smaller");
  const name = validateFilename(filename);
  const detectedMimeType = detect(buffer);
  if (declaredMime !== name.expectedMime || detectedMimeType !== name.expectedMime) {
    throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "The file extension, declared type and content do not match");
  }
  const lower = buffer.toString("latin1").toLowerCase();
  if (lower.includes("<script") || lower.includes("<html") || lower.includes("javascript:") || buffer.includes(Buffer.from([0x4d, 0x5a]))) {
    throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "The file contains disallowed embedded content");
  }
  return { ...name, detectedMimeType, integrityHash: createHash("sha256").update(buffer).digest("hex") };
}

export async function storeDocument(buffer: Buffer, extension: string) {
  const root = await uploadRoot();
  const storedFilename = `${randomBytes(24).toString("hex")}.${extension === "jpeg" ? "jpg" : extension}`;
  const target = path.resolve(root, storedFilename);
  if (!contained(root, target)) throw new ApiError(500, "DOCUMENT_STORAGE_ERROR", "The document could not be stored");
  await writeFile(target, buffer, { flag: "wx", mode: 0o600 });
  return storedFilename;
}

export async function readStoredDocument(storedFilename: string, integrityHash: string) {
  const root = await uploadRoot();
  const target = path.resolve(root, storedFilename);
  if (!contained(root, target)) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  const stat = await lstat(target).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  const canonical = await realpath(target);
  if (!contained(root, canonical)) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  const buffer = await readFile(canonical);
  if (createHash("sha256").update(buffer).digest("hex") !== integrityHash) throw new ApiError(409, "DOCUMENT_INTEGRITY_FAILED", "Document integrity verification failed");
  return buffer;
}

export async function deleteStoredDocument(storedFilename: string) {
  const root = await uploadRoot();
  const target = path.resolve(root, storedFilename);
  if (!contained(root, target)) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  const stat = await lstat(target).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  const canonical = await realpath(target);
  if (!contained(root, canonical)) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  await unlink(canonical);
}
