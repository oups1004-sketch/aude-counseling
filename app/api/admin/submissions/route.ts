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
    status: ["미답장", "답장 완료", "답장 안 함"].includes(stringValue(data.replyStatus)) ? stringValue(data.replyStatus) : row.status === "연락 완료" ? "답장 완료" : "미답장",
    important: data.important === true,
    reviewed_at: stringValue(data.reviewedAt) || (data.replyStatus && data.replyStatus !== "미답장" || row.status === "연락 완료" ? row.created_at : null),
    created_at: row.created_at,
    name: null,
    nickname: stringValue(data.nickname) || "익명",
    age_group: stringValue(data.ageGroup) || null,
    gender: stringValue(data.gender) || null,
    contact: stringValue(data.email) || null,
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
  const assessmentPackage = stringValue(data.assessmentPackage);
  const requestedTests = stringValue(data.requestedTests);
  const reason = stringValue(data.reason);
  return {
    id: `counseling:${row.id}`,
    reference_code: `COUNSEL-${row.id.slice(0, 8).toUpperCase()}`,
    kind: service === "심리검사·해석상담" ? ("assessment" as const) : ("intake" as const),
    status: data.adminManagedClient ? "확정" : (data.admissionStatus === "신규" && data.reviewedAt ? "확인" : stringValue(data.admissionStatus)) || (["진행", "종결"].includes(row.status) ? "확정" : ["확인", "연락 완료"].includes(row.status) ? "확인" : row.status || "신규"),
    reviewed_at: stringValue(data.reviewedAt) || (data.adminManagedClient || data.admissionStatus && data.admissionStatus !== "신규" || ["확인", "연락 완료", "진행", "종결"].includes(row.status) ? row.created_at : null),
    client_status: data.adminManagedClient ? stringValue(data.clientStatus || "진행") : null,
    created_at: row.created_at,
    name: stringValue(data.name) || null,
    nickname: null,
    age_group: stringValue(data.ageGroup) || null,
    gender: null,
    contact: stringValue(data.contact) || null,
    service: service || null,
    preferred_time: stringValue(data.preferredTime) || null,
    message: assessmentPackage
      ? `선택 패키지: ${assessmentPackage}\n관심 검사: ${requestedTests || "-"}\n\n신청 이유: ${reason || "-"}`
      : requestedTests ? `관심 검사: ${requestedTests}\n\n신청 이유: ${reason || "-"}` : reason || null,
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
      supabaseAdminRequest("/rest/v1/counseling_requests?select=id,created_at,status,data&order=created_at.desc&limit=500&or=(data->>type.is.null,data->>type.eq.counseling)"),
    ]);

    const stories = (await storiesResponse.json()) as DbRow[];
    const counseling = ((await counselingResponse.json()) as DbRow[]).filter((row) => !["site-settings", "admin-client", "tat-session", "aude-appointment", "aude-charge", "aude-expense"].includes(String(row.data?.type)));
    const items = [
      ...stories.map(storyItem),
      ...counseling.map(counselingItem),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(items);
  } catch (error) {
    console.error("Admin list failed", error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "목록을 불러오지 못했습니다.", detail }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, status: requestedStatus, adminNote, important, action } = await request.json();
    let status = requestedStatus;
    const parsed = parseAdminId(id);
    if (action === "review" && (requestedStatus !== undefined || adminNote !== undefined || important !== undefined)) return NextResponse.json({error:"Invalid update"},{status:400});
    if (!parsed || (action !== undefined && action !== "review") || (action !== "review" && (parsed.source === "story" ? ((status !== undefined && !["미답장", "답장 완료", "답장 안 함"].includes(status)) || (important !== undefined && typeof important !== "boolean") || (status === undefined && important === undefined && adminNote === undefined)) : !["확인", "보류", "확정", "거절"].includes(status)))) {
      return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    }

    const currentResponse = await supabaseAdminRequest(`/rest/v1/${parsed.table}?id=eq.${encodeURIComponent(parsed.id)}&select=data&limit=1`);
    const currentRows = (await currentResponse.json()) as Array<{ data: Record<string, unknown> | null }>;
    if (!currentRows[0]) return NextResponse.json({ error: "접수를 찾지 못했습니다." }, { status: 404 });
    const currentData = currentRows[0].data || {};
    if (action === "review") status = currentData.adminManagedClient ? "확정" : ["확인", "보류", "확정", "거절"].includes(stringValue(currentData.admissionStatus)) ? currentData.admissionStatus : "확인";
    if (["aude-appointment", "aude-charge", "aude-expense", "tat-session", "site-settings"].includes(String(currentData.type))) return NextResponse.json({error:"접수 기록이 아닙니다."},{status:400});
    if (parsed.source === "counseling" && currentData.adminManagedClient && status !== "확정") {
      return NextResponse.json({ error: "확정된 내담자의 진행 상태는 내담자 화면에서 변경해 주세요." }, { status: 409 });
    }
    const confirming = action !== "review" && parsed.source === "counseling" && status === "확정";
    const registration = confirming && !currentData.adminManagedClient ? {
      adminManagedClient: true,
      clientCode: `C-${new Date().getFullYear()}-${parsed.id.slice(0, 5).toUpperCase()}`,
      clientName: stringValue(currentData.name),
      clientContact: stringValue(currentData.contact),
      clientStatus: "진행",
      startedAt: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
      nextSessionAt: "",
      clientMemo: stringValue(adminNote).slice(0, 2000),
      sessions: Array.isArray(currentData.sessions) ? currentData.sessions : [],
    } : {};

    const savedResponse = await supabaseAdminRequest(`/rest/v1/${parsed.table}?id=eq.${encodeURIComponent(parsed.id)}&data=eq.${encodeURIComponent(JSON.stringify(currentRows[0].data))}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...(parsed.source === "counseling" && action !== "review" ? { status: confirming ? (currentData.clientStatus === "종결" ? "종결" : "진행") : "신규" } : {}),
        data: {
          ...currentData,
          ...registration,
          ...(action === "review" || parsed.source === "counseling" ? { reviewedAt: currentData.reviewedAt || new Date().toISOString() } : {}),
          ...(parsed.source === "counseling" ? { admissionStatus: status } : { ...(action !== "review" && status !== undefined ? { replyStatus: status } : {}), ...(important !== undefined ? { important } : {}) }),
          ...(adminNote !== undefined ? { adminNote: stringValue(adminNote).slice(0, 2000) } : {}),
        },
      }),
    });

    const savedRows = await savedResponse.json() as DbRow[];
    if (!savedRows.length) return NextResponse.json({ error: "다른 변경사항이 저장되었습니다. 새로고침 후 다시 저장해 주세요." }, { status: 409 });
    return NextResponse.json({ ok: true, item: parsed.source === "story" ? storyItem(savedRows[0]) : counselingItem(savedRows[0]) });
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

    if (parsed.source === "counseling") {
      const response = await supabaseAdminRequest(`/rest/v1/${parsed.table}?id=eq.${encodeURIComponent(parsed.id)}&select=data&limit=1`);
      const rows = await response.json();
      if (["aude-appointment", "aude-charge", "aude-expense", "tat-session", "site-settings"].includes(String(rows[0]?.data?.type))) return NextResponse.json({error:"접수 기록이 아닙니다."},{status:400});
      if (rows[0]?.data?.adminManagedClient) return NextResponse.json({ error: "내담자로 등록된 접수는 상담·검사 기록 보호를 위해 삭제할 수 없습니다." }, { status: 409 });
    }
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





