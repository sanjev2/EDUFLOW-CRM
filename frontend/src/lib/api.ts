"use client";
import { apiUrl } from "./config";

let csrfToken = "";
let mfaChallenge = "";
export function setCsrfToken(token?: string) { csrfToken = token ?? ""; }
export function setPendingMfaChallenge(value: string) { mfaChallenge = value; }
export function takePendingMfaChallenge() { const value = mfaChallenge; mfaChallenge = ""; return value; }
export async function refreshCsrf() {
  const result = await api<{ csrfToken: string }>("/api/v1/auth/csrf");
  setCsrfToken(result.csrfToken);
  return result.csrfToken;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const normalizedPath = apiUrl.endsWith("/api/v1") && path.startsWith("/api/v1") ? path.slice("/api/v1".length) : path;
  const response = await fetch(`${apiUrl}${normalizedPath}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? { "x-csrf-token": csrfToken } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = body?.error;
    throw Object.assign(new Error(error?.message ?? "The request could not be completed."), { code: error?.code, details: error?.details });
  }
  if (body?.csrfToken) setCsrfToken(body.csrfToken);
  return body as T;
}
