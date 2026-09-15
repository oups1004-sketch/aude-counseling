import { NextResponse } from "next/server";

export const runtime = "nodejs";

const limits: Record<string, number> = {
  nickname: 40,
  story: 5000,
  contentConsent: 20,
  name: 40,
  ageGroup: 20,
  gender: 20,
  contact: 80,
  service: 40,
  preferredTime: 100,
  reason: 500,
};

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase public connection is not configured.");
  }

  return { url, publishableKey };
}

async function insertSubmission(table: "story_submissions" | "counseling_requests", data: Record<string, string | boolean>) {
  const { url, publishableKey } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}`, {
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
    throw new Error(`Supabase insert failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();

    // Hidden honeypot field: bots that fill it are treated as successfully handled
    // without writing anything to the database.
    if (input.website) return NextResponse.json({ ok: true });

    const clean: Record<string, string> = {};
    for (const [key, max] of Object.entries(limits)) {
      clean[key] = text(input[key], max);
    }

    const type = input.type === "story" ? "story" : input.type === "counseling" ? "counseling" : "";
    if (!type) {
      return NextResponse.json({ error: "Invalid submission type." }, { status: 400 });
    }

    if (type === "story") {
      if (!clean.story) {
        return NextResponse.json({ error: "Story is required." }, { status: 400 });
      }

      await insertSubmission("story_submissions", {
        type: "story",
        nickname: clean.nickname || "익명",
        ageGroup: clean.ageGroup,
        gender: clean.gender,
        story: clean.story,
        contentConsent: clean.contentConsent === "동의",
        privacyVersion: "2026-09",
      });
    } else {
      if (!clean.name || !clean.ageGroup || !clean.contact || !clean.service || !clean.preferredTime) {
        return NextResponse.json({ error: "Required fields are missing." }, { status: 400 });
      }

      await insertSubmission("counseling_requests", {
        type: "counseling",
        name: clean.name,
        ageGroup: clean.ageGroup,
        contact: clean.contact,
        service: clean.service,
        preferredTime: clean.preferredTime,
        reason: clean.reason,
        privacyConsent: true,
        privacyVersion: "2026-09",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Submission failed", error);
    return NextResponse.json({ error: "Unable to submit." }, { status: 500 });
  }
}
