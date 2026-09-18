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

function bool(value: unknown) {
  return value === true || value === "true";
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
    sessions,
    sessionCount: sessions.length,
    sourceReason: text(data.reason, 1000) || null,
    createdAt: row.created_at,
  };
}

async function getRows() {
  const response = await supabaseAdminRequest(
    "/rest/v1/counseling_requests?select=id,created_at,status,data&order=created_at.desc&limit=1000",
  );
  return (await response.json()) as DbRow[];
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await getRows();
    const clients = rows.filter((row) => bool(row.data?.adminManagedClient)).map(clientItem);
    return NextResponse.json(clients);
  } catch (error) {
    console.error("Client list failed", error);
    return NextResponse.json({ error: "내담자 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = await request.json();
    const sourceId = text(input.sourceId, 80);

    if (sourceId) {
      const currentResponse = await supabaseAdminRequest(
        `/rest/v1/counseling_requests?id=eq.${encodeURIComponent(sourceId)}&select=id,created_at,status,data&limit=1`,
      );
      const rows = (await currentResponse.json()) as DbRow[];
      const row = rows[0];
      if (!row) return NextResponse.json({ error: "신청 자료를 찾지 못했습니다." }, { status: 404 });

      const data = row.data || {};
      const code = clientCode(row);
      await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${encodeURIComponent(sourceId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "진행",
          data: {
            ...data,
            adminManagedClient: true,
            clientCode: code,
            clientName: text(data.name, 80),
            clientContact: text(data.contact, 120),
            clientStatus: "진행",
            startedAt: new Date().toISOString().slice(0, 10),
            nextSessionAt: "",
            clientMemo: text(data.adminNote, 5000),
            sessions: Array.isArray(data.sessions) ? data.sessions : [],
          },
        }),
      });
      return NextResponse.json({ ok: true, clientCode: code });
    }

    const name = text(input.name, 80);
    if (!name) return NextResponse.json({ error: "내담자 이름을 입력해 주세요." }, { status: 400 });

    const created = await supabaseAdminRequest("/rest/v1/counseling_requests?select=id,created_at,status,data", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "진행",
        data: {
          type: "admin-client",
          adminManagedClient: true,
          name,
          clientName: name,
          contact: text(input.contact, 120),
          clientContact: text(input.contact, 120),
          ageGroup: text(input.ageGroup, 40),
          service: text(input.service, 80),
          clientStatus: "진행",
          startedAt: text(input.startedAt, 20) || new Date().toISOString().slice(0, 10),
          nextSessionAt: text(input.nextSessionAt, 40),
          clientMemo: text(input.memo, 5000),
          sessions: [],
          privacyVersion: "admin-managed-2026-09",
        },
      }),
    });

    const rows = (await created.json()) as DbRow[];
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "내담자를 만들지 못했습니다." }, { status: 500 });

    const code = clientCode(row);
    await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ data: { ...(row.data || {}), clientCode: code } }),
    });

    return NextResponse.json({ ok: true, clientCode: code });
  } catch (error) {
    console.error("Client create failed", error);
    return NextResponse.json({ error: "내담자를 등록하지 못했습니다." }, { status: 500 });
  }
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
    if (!row || !bool(row.data?.adminManagedClient)) {
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

    await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: status === "종결" ? "종결" : "진행", data: nextData }),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Client update failed", error);
    return NextResponse.json({ error: "내담자 정보를 저장하지 못했습니다." }, { status: 500 });
  }
}
