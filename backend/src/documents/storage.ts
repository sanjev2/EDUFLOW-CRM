import { createHash, randomBytes } from "node:crypto";
import { mkdir, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
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
const invalidContent = () => new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "The file content is malformed or contains unsupported embedded content");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

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

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngPasses(width: number, height: number, interlace: number) {
  if (!interlace) return [{ width, height }];
  return [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
    .map(([x, y, dx, dy]) => ({
      width: width <= x! ? 0 : Math.ceil((width - x!) / dx!),
      height: height <= y! ? 0 : Math.ceil((height - y!) / dy!),
    }));
}

function validatePng(buffer: Buffer) {
  if (!buffer.subarray(0, 8).equals(pngSignature)) throw invalidContent();
  let offset = 8;
  let ihdr: { width: number; height: number; bitDepth: number; colorType: number; interlace: number } | undefined;
  let sawIdat = false;
  let sawPlte = false;
  let idatEnded = false;
  let sawIend = false;
  const imageData: Buffer[] = [];
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw invalidContent();
    const length = buffer.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const dataEnd = dataOffset + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataOffset || chunkEnd > buffer.length) throw invalidContent();
    const type = buffer.subarray(typeOffset, dataOffset).toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) throw invalidContent();
    if (crc32(buffer.subarray(typeOffset, dataEnd)) !== buffer.readUInt32BE(dataEnd)) throw invalidContent();
    const data = buffer.subarray(dataOffset, dataEnd);
    if (!ihdr && type !== "IHDR") throw invalidContent();
    if (type === "IHDR") {
      if (ihdr || length !== 13) throw invalidContent();
      const width = data.readUInt32BE(0); const height = data.readUInt32BE(4);
      const bitDepth = data[8]!; const colorType = data[9]!; const compression = data[10]!; const filter = data[11]!; const interlace = data[12]!;
      const validDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || !validDepths[colorType]?.includes(bitDepth) || compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) throw invalidContent();
      ihdr = { width, height, bitDepth, colorType, interlace };
    } else if (type === "IDAT") {
      if (!ihdr || idatEnded || sawIend) throw invalidContent();
      sawIdat = true;
      imageData.push(data);
    } else {
      if (sawIdat) idatEnded = true;
      if (type === "PLTE") {
        if (!ihdr || sawPlte || sawIdat || [0, 4].includes(ihdr.colorType) || !length || length > 768 || length % 3) throw invalidContent();
        sawPlte = true;
      }
      if (type === "IEND") {
        if (!sawIdat || sawIend || length !== 0 || (ihdr?.colorType === 3 && !sawPlte)) throw invalidContent();
        sawIend = true;
        offset = chunkEnd;
        break;
      }
      if ((type.charCodeAt(0) & 0x20) === 0 && type !== "PLTE") throw invalidContent();
    }
    offset = chunkEnd;
  }
  if (!ihdr || !sawIdat || !sawIend || offset !== buffer.length) throw invalidContent();
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bitsPerPixel = channels[ihdr.colorType]! * ihdr.bitDepth;
  const passes = pngPasses(ihdr.width, ihdr.height, ihdr.interlace);
  const expectedBytes = passes.reduce((total, pass) => total + (pass.width && pass.height ? pass.height * (1 + Math.ceil(pass.width * bitsPerPixel / 8)) : 0), 0);
  if (!expectedBytes || expectedBytes > 128 * 1024 * 1024) throw invalidContent();
  let decoded: Buffer;
  try { decoded = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedBytes }); } catch { throw invalidContent(); }
  if (decoded.length !== expectedBytes) throw invalidContent();
  let decodedOffset = 0;
  for (const pass of passes) {
    if (!pass.width || !pass.height) continue;
    const rowBytes = 1 + Math.ceil(pass.width * bitsPerPixel / 8);
    for (let row = 0; row < pass.height; row += 1) {
      if (decoded[decodedOffset]! > 4) throw invalidContent();
      decodedOffset += rowBytes;
    }
  }
}

const jpegFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
function validateJpeg(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw invalidContent();
  let offset = 2; let sawFrame = false; let sawScan = false;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw invalidContent();
    while (buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) throw invalidContent();
    const marker = buffer[offset++]!;
    if (marker === 0xd9) {
      if (!sawFrame || !sawScan || offset !== buffer.length) throw invalidContent();
      return;
    }
    if (marker === 0xd8 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) throw invalidContent();
    if (offset + 2 > buffer.length) throw invalidContent();
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) throw invalidContent();
    const dataOffset = offset + 2;
    if (jpegFrameMarkers.has(marker)) {
      if (length < 8 || !buffer.readUInt16BE(dataOffset + 1) || !buffer.readUInt16BE(dataOffset + 3) || !buffer[dataOffset + 5]) throw invalidContent();
      sawFrame = true;
    }
    offset += length;
    if (marker === 0xda) {
      if (!sawFrame) throw invalidContent();
      sawScan = true;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue; }
        const markerOffset = offset;
        while (buffer[offset] === 0xff) offset += 1;
        if (offset >= buffer.length) throw invalidContent();
        const scanMarker = buffer[offset]!;
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) { offset += 1; continue; }
        offset = markerOffset;
        break;
      }
    }
  }
  throw invalidContent();
}

function pdfOutsideStreams(source: string) {
  let result = ""; let offset = 0;
  const streamPattern = /\bstream(?:\r\n|\n|\r)/g;
  while (offset < source.length) {
    streamPattern.lastIndex = offset;
    const match = streamPattern.exec(source);
    if (!match) break;
    result += source.slice(offset, match.index) + "stream\n";
    const dictionaryStart = source.lastIndexOf("<<", match.index);
    const dictionaryEnd = source.lastIndexOf(">>", match.index);
    const dictionary = dictionaryStart >= 0 && dictionaryEnd > dictionaryStart ? source.slice(dictionaryStart, dictionaryEnd + 2) : "";
    const lengthMatch = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dictionary);
    let end = -1;
    if (lengthMatch) {
      const length = Number(lengthMatch[1]);
      const dataEnd = streamPattern.lastIndex + length;
      if (!Number.isSafeInteger(length) || length < 0 || dataEnd > source.length) throw invalidContent();
      let tokenStart = dataEnd;
      if (source.startsWith("\r\n", tokenStart)) tokenStart += 2;
      else if (source[tokenStart] === "\n" || source[tokenStart] === "\r") tokenStart += 1;
      if (source.startsWith("endstream", tokenStart)) end = tokenStart;
    } else {
      end = source.indexOf("endstream", streamPattern.lastIndex);
    }
    if (end < 0) throw invalidContent();
    result += "endstream";
    offset = end + "endstream".length;
  }
  return result + source.slice(offset);
}

function validatePdf(buffer: Buffer) {
  const source = buffer.toString("latin1");
  if (!/^%PDF-\d\.\d(?:\r\n|\n|\r)/.test(source)) throw invalidContent();
  const eof = source.lastIndexOf("%%EOF");
  if (eof < 0 || source.slice(eof + 5).trim().length) throw invalidContent();
  const structuralText = pdfOutsideStreams(source.slice(0, eof + 5));
  if (/\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia)\b|<html|<svg|\bMZ\b/i.test(structuralText)) throw invalidContent();
}

function detect(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(pngSignature)) { validatePng(buffer); return "image/png" as const; }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) { validateJpeg(buffer); return "image/jpeg" as const; }
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") { validatePdf(buffer); return "application/pdf" as const; }
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
