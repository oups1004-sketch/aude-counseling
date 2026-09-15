import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdminRequest, verifyAdminSession } from "../../../lib/supabase";

export const runtime = "nodejs";

type DbRow = {
  id: string;
  created_at: string;
  status: string;
  data: Record<string, unknown> | null;
};

async function authorized() {
  const store = await cookies();
  return verifyAdminSession(store.get("aude_admin_token")?.value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function storyItem(row: DbRow) {
  const data = row.data || {};
  return {
    id: `story:${row.id}`,
    reference_code: `STORY-${row.id.slice(0, 8).toUpperCase()}`,
    kind: "story" as const,
    status: row.status || "신규",
    created_at: row.created_at,
    name: null,
    nickname: stringValue(data.nickname) || "익명",
    age_group: null,
    contact: null,
    service: null,
    preferred_time: null,
    message: stringValue(data.story),
    content_consent: Boolean(data.contentConsent),
    admin_note: stringValue(data.adminNote) || null,
  };
}

function counselingItem(row: DbRow) {
  const data = row.data || {};
  const service = stringValue(data.service);
  return {
    id: `counseling:${row.id}`,
    reference_code: `COUNSEL-${row.id.slice(0, 8).toUpperCase()}`,
    kind: service === "심리검사·해석상담" ? ("assessment" as const) : ("intake" as const),
    status: row.status || "신규",
    created_at: row.created_at,
    name: stringValue(data.name) || null,
    nickname: null,
    age_group: stringValue(data.ageGroup) || null,
    contact: stringValue(data.contact) || null,
    service: service || null,
    preferred_time: stringValue(data.preferredTime) || null,
    message: stringValue(data.reason) || null,
    content_consent: false,
    admin_note: stringValue(data.adminNote) || null,
  };
}

function parseAdminId(value: unknown) {
  const raw = stringValue(value);
  const [source, id] = raw.split(":", 2);
  if (!id || !["story", "counseling"].includes(source)) return null;
  return {
    source,
    id,
    table: source === "story" ? "story_submissions" : "counseling_requests",
  } as const;
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [storiesResponse, counselingResponse] = await Promise.all([
      supabaseAdminRequest("/rest/v1/story_submissions?select=id,created_at,status,data&order=created_at.desc&limit=500"),
      supabaseAdminRequest("/rest/v1/counseling_requests?select=id,created_at,status,data&order=created_at.desc&limit=500"),
    ]);

    const stories = (await storiesResponse.json()) as DbRow[];
    const counseling = (await counselingResponse.json()) as DbRow[];
    const items = [
      ...stories.map(storyItem),
      ...counseling.map(counselingItem),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(items);
  } catch (error) {
    console.error("Admin list failed", error);
    return NextResponse.json({ error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, status, adminNote } = await request.json();
    const parsed = parseAdminId(id);
    if (!parsed || !["신규", "확인", "연락 완료", "진행", "종결"].includes(status)) {
      return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    }

    const currentResponse = await supabaseAdminRequest(`/rest/v1/${parsed.table}?id=eq.${encodeURIComponent(parsed.id)}&select=data&limit=1`);
    const currentRows = (await currentResponse.json()) as Array<{ data: Record<string, unknown> | null }>;
    const currentData = currentRows[0]?.data || {};

    await supabaseAdminRequest(`/rest/v1/${parsed.table}?id=eq.${encodeURIComponent(parsed.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status,
        data: {
          ...currentData,
          adminNote: stringValue(adminNote).slice(0, 2000),
        },
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin update failed", error);
    return NextResponse.json({ error: "수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const parsed = parseAdminId(new URL(request.url).searchParams.get("id"));
    if (!parsed) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await supabaseAdminRequest(`/rest/v1/${parsed.table}?id=eq.${encodeURIComponent(parsed.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin delete failed", error);
    return NextResponse.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }
}
