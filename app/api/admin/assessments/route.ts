import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdminRequest, verifyAdminSession } from "../../../lib/supabase";

import { assessmentStates, assessmentStatus } from "../../../lib/assessment-status";

export const runtime = "nodejs";
const bucket = "aude-assessment-private";
const states = assessmentStates;
const clean = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
type Attachment = { path: string; name: string };
type RecordItem = { id: string; testName: string; date: string; status: string; scores: string; note: string; deliveryText?: string; interpretationDate: string; reaction: string; resultFile?: Attachment; summaryFile?: Attachment; updatedAt: string };
async function authorized() {
  return verifyAdminSession((await cookies()).get("aude_admin_token")?.value);
}
async function client(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("내담자 번호를 확인해 주세요.");
  const response = await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${encodeURIComponent(id)}&select=data&limit=1`);
  const rows = await response.json();
  if (!rows[0]?.data?.adminManagedClient) throw new Error("내담자를 찾지 못했습니다.");
  return rows[0].data as Record<string, unknown>;
}
async function ensureBucket() {
  const response = await supabaseAdminRequest("/storage/v1/bucket");
  const buckets = await response.json() as Array<{ id: string; public: boolean }>;
  const existing = buckets.find((b) => b.id === bucket);
  if (existing?.public) throw new Error("파일 저장소가 비공개로 설정되어 있지 않습니다.");
  if (existing) return;
  try {
    await supabaseAdminRequest("/storage/v1/bucket", { method: "POST", body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 3145728, allowed_mime_types: ["application/pdf"] }) });
  } catch (error) {
    const check = await supabaseAdminRequest("/storage/v1/bucket");
    const list = await check.json() as Array<{ id: string; public: boolean }>;
    if (!list.some((b) => b.id === bucket && !b.public)) throw error;
  }
}
export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const data = await client(params.get("clientId") || "");
    const records = (Array.isArray(data.assessments) ? data.assessments : []) as RecordItem[];
    const record = records.find((r) => r.id === params.get("recordId"));
    const file = params.get("kind") === "summary" ? record?.summaryFile : record?.resultFile;
    if (!file) return NextResponse.json({ error: "파일을 찾지 못했습니다." }, { status: 404 });
    const response = await supabaseAdminRequest(`/storage/v1/object/authenticated/${bucket}/${file.path}`);
    return new Response(response.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(file.name), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "파일을 불러오지 못했습니다." }, { status: 400 });
  }
}
export async function POST(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uploaded: string[] = [];
  try {
    if (Number(request.headers.get("content-length") || 0) > 4400000) throw new Error("파일은 각각 3MB, 두 파일 합계 4MB 이하로 첨부해 주세요.");
    const form = await request.formData();
    const totalBytes = ["resultFile", "summaryFile"].reduce((sum, key) => {
      const file = form.get(key);
      return sum + (file instanceof File ? file.size : 0);
    }, 0);
    if (totalBytes > 4194304) throw new Error("두 PDF 파일의 합계는 4MB 이하여야 합니다.");
    const id = clean(form.get("clientId"), 80);
    const data = await client(id);
    const records = (Array.isArray(data.assessments) ? [...data.assessments] : []) as RecordItem[];
    const editId = clean(form.get("recordId"), 80);
    const old = records.find((r) => r.id === editId);
    if (editId && !old) throw new Error("수정할 검사 기록을 찾지 못했습니다.");
    if (!old && records.length >= 200) throw new Error("내담자별 검사 기록은 최대 200개까지 등록할 수 있습니다.");
    if (old && clean(form.get("updatedAt"), 80) !== old.updatedAt) throw new Error("기록이 변경되었습니다. 새로고침 후 다시 확인해 주세요.");
    const testName = clean(form.get("testName"), 100);
    const status = assessmentStatus(clean(form.get("status"), 40));
    if (!testName || !states.includes(status)) throw new Error("검사명과 진행 상태를 확인해 주세요.");
    const record: RecordItem = { ...old, id: old?.id || crypto.randomUUID(), testName, date: clean(form.get("date"), 20), status, deliveryText: form.has("deliveryText") ? clean(form.get("deliveryText"), 16000) : old?.deliveryText || "", scores: clean(form.get("scores"), 16000), note: clean(form.get("note"), 8000), interpretationDate: clean(form.get("interpretationDate"), 20), reaction: clean(form.get("reaction"), 4000), updatedAt: new Date().toISOString() };
    for (const key of ["resultFile", "summaryFile"] as const) {
      const file = form.get(key);
      if (!(file instanceof File) || !file.size) continue;
      if (file.size > 3145728) throw new Error("PDF 파일은 각각 3MB 이하로 첨부해 주세요.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("PDF 파일만 첨부할 수 있습니다.");
      await ensureBucket();
      const path = `${id}/${record.id}/${crypto.randomUUID()}.pdf`;
      await supabaseAdminRequest(`/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: bytes });
      uploaded.push(path);
      record[key] = { path, name: clean(file.name, 160) || "검사결과.pdf" };
    }
    if (old) records[records.findIndex((r) => r.id === record.id)] = record;
    else records.unshift(record);
    // Compare the JSON snapshot so simultaneous memo/session saves cannot be overwritten.
    const response = await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${encodeURIComponent(id)}&data=eq.${encodeURIComponent(JSON.stringify(data))}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: { ...data, assessments: records } }),
    });
    const saved = await response.json();
    if (!saved.length) throw new Error("다른 변경사항이 저장되었습니다. 새로고침 후 다시 저장해 주세요.");
    for (const key of ["resultFile", "summaryFile"] as const) {
      if (old?.[key] && old[key]?.path !== record[key]?.path) {
        await supabaseAdminRequest(`/storage/v1/object/${bucket}`, { method: "DELETE", body: JSON.stringify({ prefixes: [old[key]!.path] }) }).catch(() => undefined);
      }
    }
    return NextResponse.json({ records });
  } catch (error) {
    if (uploaded.length) await supabaseAdminRequest(`/storage/v1/object/${bucket}`, { method: "DELETE", body: JSON.stringify({ prefixes: uploaded }) }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error && !error.message.startsWith("Supabase") ? error.message : "검사 기록을 저장하지 못했습니다. 연결 상태를 확인해 주세요." }, { status: 400 });
  }
}
