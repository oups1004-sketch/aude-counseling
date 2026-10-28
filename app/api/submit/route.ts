import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getApplicationStatus } from "../../lib/counseling-status";

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
  assessmentPackage: 100,
  requestedTests: 300,
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

async function insertSubmission(table: "story_submissions" | "counseling_requests", data: Record<string, string | boolean>, id?: string) {
  const { url, publishableKey } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ...(id ? { id } : {}), data }),
  });

  if (!response.ok) {
    const detail = await response.text();
    // Only our content-bound story ID can turn a duplicate into success.
    // Never update the existing row: it may already have an admin reply or note.
    if (table === "story_submissions" && id && response.status === 409) {
      try {
        const failure = JSON.parse(detail);
        if (failure.code === "23505" && /\bstory_submissions_pkey\b/.test(failure.message || "")) return;
      } catch { /* Other failures remain errors. */ }
    }
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
      const email = String(input.email ?? "").trim();
      if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return NextResponse.json({ error: "이메일 주소를 확인해 주세요." }, { status: 400 });
      }
      if (!clean.story) {
        return NextResponse.json({ error: "사연 내용을 입력해 주세요." }, { status: 400 });
      }
      if (clean.contentConsent !== "동의") {
        return NextResponse.json({ error: "콘텐츠 활용 동의를 확인해 주세요." }, { status: 400 });
      }
      if (input.privacyConsent !== true) {
        return NextResponse.json({ error: "개인정보 처리 안내를 확인해 주세요." }, { status: 400 });
      }
      if (input.requestId !== undefined && (typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))) {
        return NextResponse.json({ error: "접수 확인 정보를 다시 만들어 주세요. 작성 화면에서 다시 진행해 주세요." }, { status: 400 });
      }

      // Stable for retries, different for edited content. Hashing also prevents
      // callers from choosing an existing record's raw ID to fake a receipt.
      const fingerprint = JSON.stringify(["aude-story-v1", input.requestId, clean.nickname || "익명", email, clean.ageGroup, clean.gender, clean.story, "2026-10-27-oesamchun", "2026-10"]);
      const hex = createHash("sha256").update(fingerprint).digest("hex");
      const id = input.requestId ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}` : undefined;

      await insertSubmission("story_submissions", {
        type: "story",
        nickname: clean.nickname || "익명",
        email,
        replyStatus: "미답장",
        important: false,
        ageGroup: clean.ageGroup,
        gender: clean.gender,
        story: clean.story,
        contentConsent: true,
        contentConsentAt: new Date().toISOString(),
        contentConsentVersion: "2026-10-27-oesamchun",
        privacyConsent: true,
        privacyConsentAt: new Date().toISOString(),
        privacyVersion: "2026-10",
      }, id);
    } else {
      if (!["개인상담", "심리검사·해석상담"].includes(clean.service)) {
        return NextResponse.json({ error: "신청 서비스를 확인해 주세요." }, { status: 400 });
      }
      const { counselingOpen, assessmentOpen } = await getApplicationStatus();
      if (clean.service === "개인상담" && !counselingOpen) {
        return NextResponse.json({ error: "현재 상담 신청이 마감되었습니다." }, { status: 409 });
      }
      if (clean.service === "심리검사·해석상담" && !assessmentOpen) {
        return NextResponse.json({ error: "현재 심리검사 신청이 마감되었습니다." }, { status: 409 });
      }
      if (!clean.name || !clean.ageGroup || !clean.contact || !clean.service || !clean.preferredTime) {
        return NextResponse.json({ error: "필수 입력 항목을 확인해 주세요." }, { status: 400 });
      }

      await insertSubmission("counseling_requests", {
        type: "counseling",
        name: clean.name,
        ageGroup: clean.ageGroup,
        contact: clean.contact,
        service: clean.service,
        assessmentPackage: clean.assessmentPackage,
        requestedTests: clean.requestedTests,
        preferredTime: clean.preferredTime,
        reason: clean.reason,
        privacyConsent: true,
        privacyVersion: "2026-10",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Submission failed", error);
    return NextResponse.json({ error: "Unable to submit." }, { status: 500 });
  }
}


