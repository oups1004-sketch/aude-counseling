import { createHash, timingSafeEqual } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY;
const adminPassword = process.env.ADMIN_PASSWORD;

function requireAdminConfig() {
  if (!url || !secretKey) throw new Error("Supabase admin connection is not configured.");
  return { url, secretKey };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export function verifyAdminPassword(input: unknown) {
  if (!adminPassword) return false;
  const actual = hash(String(input ?? ""));
  const expected = hash(adminPassword);
  return timingSafeEqual(actual, expected);
}

export function adminSessionToken() {
  if (!adminPassword) throw new Error("Admin password is not configured.");
  return createHash("sha256").update(`aude-admin-session:${adminPassword}`).digest("hex");
}

export function verifyAdminSession(value: string | undefined) {
  if (!value || !adminPassword) return false;
  const actual = hash(value);
  const expected = hash(adminSessionToken());
  return timingSafeEqual(actual, expected);
}

export async function supabaseAdminRequest(path: string, init: RequestInit = {}) {
  const current = requireAdminConfig();
  const response = await fetch(current.url + path, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: current.secretKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase admin request failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  return response;
}
