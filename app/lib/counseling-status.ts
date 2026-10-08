import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdminRequest } from "./supabase";

type SettingsData = {
  type?: unknown;
  counselingOpen?: unknown;
  assessmentOpen?: unknown;
  updatedAt?: unknown;
  signature?: unknown;
};

type SettingsRow = {
  data: SettingsData | null;
};

function settingsSecret() {
  const value = process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("Supabase settings signing key is not configured.");
  return value;
}

function signature(counselingOpen: boolean, assessmentOpen: boolean, updatedAt: string) {
  return createHmac("sha256", settingsSecret())
    .update(`${counselingOpen}:${assessmentOpen}:${updatedAt}`)
    .digest("hex");
}

function validSettings(data: SettingsData | null): data is SettingsData & {
  counselingOpen: boolean;
  assessmentOpen: boolean;
  updatedAt: string;
  signature: string;
} {
  if (
    data?.type !== "site-settings" ||
    typeof data.counselingOpen !== "boolean" ||
    typeof data.updatedAt !== "string" ||
    typeof data.signature !== "string"
  ) return false;

  // Settings saved before assessment applications existed remain valid and
  // mean that psychological assessments are open.
  const assessmentOpen = typeof data.assessmentOpen === "boolean" ? data.assessmentOpen : true;
  const actual = Buffer.from(data.signature);
  const expected = Buffer.from(signature(data.counselingOpen, assessmentOpen, data.updatedAt));
  const legacyExpected = Buffer.from(createHmac("sha256", settingsSecret()).update(`${data.counselingOpen}:${data.updatedAt}`).digest("hex"));
  return (actual.length === expected.length && timingSafeEqual(actual, expected)) || (actual.length === legacyExpected.length && timingSafeEqual(actual, legacyExpected));
}

export async function getApplicationStatus() {
  const response = await supabaseAdminRequest(
    "/rest/v1/counseling_requests?select=data&order=created_at.desc&limit=1000",
  );
  const rows = (await response.json()) as SettingsRow[];
  const settings = rows.find((row) => validSettings(row.data));
  return {
    counselingOpen: settings?.data?.counselingOpen !== false,
    assessmentOpen: settings?.data?.assessmentOpen !== false,
  };
}

export async function setApplicationStatus(counselingOpen: boolean, assessmentOpen: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase public connection is not configured.");

  const updatedAt = new Date().toISOString();
  const data = {
    type: "site-settings",
    counselingOpen,
    assessmentOpen,
    updatedAt,
    signature: signature(counselingOpen, assessmentOpen, updatedAt),
  };

  // The live database grants INSERT-only access for new requests, while its
  // service role currently has no table INSERT privilege. Store each status
  // change as a signed append-only row through the existing insert policy.
  const response = await fetch(`${url}/rest/v1/counseling_requests`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase settings insert failed (${response.status}): ${detail.slice(0, 400)}`);
  }
}
