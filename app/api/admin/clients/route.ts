import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdminRequest, verifyAdminSession } from "../../../lib/supabase";

import { getOperations } from "../../../lib/operations";
import { isConfirmedClient } from "../../../lib/client-eligibility";

export const runtime = "nodejs";

type DbRow = {
  id: string;
  created_at: string;
  status: string;
  data: Record<string, unknown> | null;
};

type SessionRecord = {
  id: string;
  date: string;
  sessionNo: number;
  summary: string;
  nextPlan: string;
};

async function authorized() {
  const store = await cookies();
  return verifyAdminSession(store.get("aude_admin_token")?.value);
}

function text(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function clientCode(row: DbRow) {
  const saved = text(row.data?.clientCode, 40);
  if (saved) return saved;
  const year = new Date(row.created_at).getFullYear();
  return `C-${year}-${row.id.slice(0, 5).toUpperCase()}`;
}

function clientItem(row: DbRow) {
  const data = row.data || {};
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  return {
    id: row.id,
    clientCode: clientCode(row),
    name: text(data.clientName || data.name, 80) || "이름 미입력",
    contact: text(data.clientContact || data.contact, 120) || null,
    ageGroup: text(data.ageGroup, 40) || null,
    service: text(data.service, 80) || null,
    status: text(data.clientStatus || row.status, 30) || "진행",
    startedAt: text(data.startedAt, 20) || row.created_at.slice(0, 10),
    nextSessionAt: text(data.nextSessionAt, 40) || null,
    memo: text(data.clientMemo, 5000) || null,
    assessments: Array.isArray(data.assessments) ? data.assessments : [],
    sessions,
    sessionCount: sessions.length,
    sourceReason: text(data.reason, 1000) || null,
    createdAt: row.created_at,
  };
}

async function getRows() {
  const response = await supabaseAdminRequest(
    "/rest/v1/counseling_requests?select=id,created_at,status,data&order=created_at.desc&limit=1000&or=(data->>type.is.null,data->>type.eq.counseling)",
  );
  return (await response.json()) as DbRow[];
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [rows, operations] = await Promise.all([getRows(), getOperations()]);
    const appointments = operations.filter(r => r.data.type === "aude-appointment");
    const calendarClients = new Set(appointments.map(r => r.data.clientId));
    const upcoming = appointments.filter(r => r.data.status === "예약" && Date.parse(r.data.startAt!) >= Date.now()).sort((a,b) => a.data.startAt!.localeCompare(b.data.startAt!));
    const clients = rows.filter((row) => isConfirmedClient(row.data)).map(row => {
      const item = clientItem(row);
      return {...item, nextSessionAt: calendarClients.has(row.id) ? upcoming.find(r => r.data.clientId === row.id)?.data.startAt || null : item.nextSessionAt};
    });
    return NextResponse.json(clients);
  } catch (error) {
    console.error("Client list failed", error);
    return NextResponse.json({ error: "내담자 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "접수 화면에서 상담·심리검사 신청을 확정하면 내담자로 자동 등록됩니다." }, { status: 409 });
}

export async function PATCH(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = await request.json();
    const id = text(input.id, 80);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const currentResponse = await supabaseAdminRequest(
      `/rest/v1/counseling_requests?id=eq.${encodeURIComponent(id)}&select=id,created_at,status,data&limit=1`,
    );
    const rows = (await currentResponse.json()) as DbRow[];
    const row = rows[0];
    if (!row || !isConfirmedClient(row.data)) {
      return NextResponse.json({ error: "내담자를 찾지 못했습니다." }, { status: 404 });
    }

    const data = row.data || {};
    const sessions = Array.isArray(data.sessions) ? [...data.sessions] : [];

    if (input.session) {
      const sessionInput = input.session as Record<string, unknown>;
      const nextSession: SessionRecord = {
        id: crypto.randomUUID(),
        date: text(sessionInput.date, 20) || new Date().toISOString().slice(0, 10),
        sessionNo: Number(sessionInput.sessionNo) || sessions.length + 1,
        summary: text(sessionInput.summary, 8000),
        nextPlan: text(sessionInput.nextPlan, 4000),
      };
      sessions.push(nextSession);
    }

    const status = text(input.status, 30) || text(data.clientStatus, 30) || row.status || "진행";
    if (!["진행", "휴식", "종결"].includes(status)) return NextResponse.json({ error: "잘못된 상담 상태입니다." }, { status: 400 });
    const nextData = {
      ...data,
      adminManagedClient: true,
      clientCode: text(data.clientCode, 40) || clientCode(row),
      clientName: input.name === undefined ? text(data.clientName || data.name, 80) : text(input.name, 80),
      clientContact: input.contact === undefined ? text(data.clientContact || data.contact, 120) : text(input.contact, 120),
      clientStatus: status,
      startedAt: input.startedAt === undefined ? text(data.startedAt, 20) : text(input.startedAt, 20),
      nextSessionAt: input.nextSessionAt === undefined ? text(data.nextSessionAt, 40) : text(input.nextSessionAt, 40),
      clientMemo: input.memo === undefined ? text(data.clientMemo, 5000) : text(input.memo, 5000),
      sessions,
    };

    const savedResponse = await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${encodeURIComponent(id)}&data=eq.${encodeURIComponent(JSON.stringify(row.data))}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: status === "종결" ? "종결" : "진행", data: nextData }),
    });

    if (!(await savedResponse.json()).length) return NextResponse.json({ error: "다른 변경사항이 저장되었습니다. 다시 열고 저장해 주세요." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Client update failed", error);
    return NextResponse.json({ error: "내담자 정보를 저장하지 못했습니다." }, { status: 500 });
  }
}


