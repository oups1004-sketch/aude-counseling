"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SessionRecord = { id: string; date: string; sessionNo: number; summary: string; nextPlan: string };
type Client = {
  id: string;
  clientCode: string;
  name: string;
  contact: string | null;
  ageGroup: string | null;
  service: string | null;
  status: string;
  startedAt: string;
  nextSessionAt: string | null;
  memo: string | null;
  sessions: SessionRecord[];
  sessionCount: number;
  sourceReason: string | null;
};

const statuses = ["진행", "휴식", "종결"];

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [auth, setAuth] = useState<"checking" | "ready" | "login">("checking");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/clients", { cache: "no-store" });
    if (response.status === 401) return setAuth("login");
    if (!response.ok) throw new Error("load failed");
    setClients(await response.json());
    setAuth("ready");
  }, []);

  useEffect(() => { load().catch(() => setAuth("login")); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client) => [client.clientCode, client.name, client.contact, client.service, client.memo]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [clients, query]);

  const upcoming = useMemo(() => clients
    .filter((client) => client.nextSessionAt && client.status !== "종결")
    .sort((a, b) => String(a.nextSessionAt).localeCompare(String(b.nextSessionAt))), [clients]);

  if (auth === "checking") return <main className="adminShell"><div className="adminLoading">AUDE · 내담자 목록 확인 중</div></main>;
  if (auth === "login") return <main className="adminShell"><section className="adminLogin"><Link href="/admin" className="adminBrand">AUDE</Link><h1>로그인이 필요합니다.</h1><p>관리자 페이지에서 로그인한 뒤 이용해 주세요.</p><Link href="/admin" className="adminBack">← 관리자 로그인</Link></section></main>;

  return (
    <main className="adminShell">
      <AdminHeader />
      <section className="adminDashboard workspacePage">
        <div className="workspaceHeading">
          <div><p className="sectionNumber">COUNSELING DESK</p><h1>내담자 관리</h1><p>내담자 기본정보, 다음 상담일과 회기 기록을 한곳에서 관리합니다.</p></div>
          <button className="workspacePrimary" onClick={() => setCreating(true)}>+ 내담자 등록</button>
        </div>

        <div className="workspaceMetrics">
          <Metric value={clients.filter((c) => c.status === "진행").length} label="진행 내담자" />
          <Metric value={upcoming.length} label="예정 상담" />
          <Metric value={clients.reduce((sum, c) => sum + c.sessionCount, 0)} label="기록된 회기" />
          <Metric value={clients.filter((c) => c.status === "종결").length} label="종결" />
        </div>

        <div className="clientToolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="내담자 코드·이름·연락처 검색" /></div>

        {upcoming.length > 0 && (
          <section className="upcomingStrip">
            <strong>다가오는 상담</strong>
            <div>{upcoming.slice(0, 4).map((client) => <button key={client.id} onClick={() => setSelected(client)}><span>{formatDateTime(client.nextSessionAt)}</span><b>{client.name}</b></button>)}</div>
          </section>
        )}

        <div className="clientTable">
          <div className="clientTableHead"><span>내담자</span><span>상태</span><span>최근 회기</span><span>다음 상담</span></div>
          {filtered.length === 0 && <div className="adminEmpty">등록된 내담자가 없습니다.</div>}
          {filtered.map((client) => (
            <button className="clientRow" key={client.id} onClick={() => setSelected(client)}>
              <span className="clientIdentity"><b>{client.name}</b><small>{client.clientCode}{client.service ? ` · ${client.service}` : ""}</small></span>
              <span><em className={`clientStatus status-${client.status}`}>{client.status}</em></span>
              <span>{client.sessionCount ? `${client.sessionCount}회기` : "기록 없음"}</span>
              <span>{client.nextSessionAt ? formatDateTime(client.nextSessionAt) : "미정"}</span>
            </button>
          ))}
        </div>
      </section>

      {creating && <CreateClient busy={busy} onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await load(); }} setBusy={setBusy} />}
      {selected && <ClientModal client={selected} busy={busy} setBusy={setBusy} onClose={() => setSelected(null)} onSaved={async () => { await load(); setSelected(null); }} />}
    </main>
  );
}

function AdminHeader() {
  return <header className="adminHeader workspaceHeader"><div><Link href="/" className="adminBrand">AUDE</Link><span>통합 관리</span></div><nav><Link href="/admin">접수</Link><Link className="active" href="/admin/clients">내담자</Link><Link href="/admin/jobs">채용공고</Link></nav></header>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="workspaceMetric"><strong>{value}</strong><span>{label}</span></div>;
}

function CreateClient({ busy, onClose, onCreated, setBusy }: { busy: boolean; onClose: () => void; onCreated: () => void; setBusy: (v: boolean) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/admin/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setBusy(false);
    if (!response.ok) return alert((await response.json().catch(() => ({}))).error || "등록하지 못했습니다.");
    onCreated();
  }
  return <div className="adminModalBackdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="adminModal workspaceModal"><button className="adminModalClose" onClick={onClose}>×</button><p className="sectionNumber">NEW CLIENT</p><h2>내담자 등록</h2><form className="clientForm" onSubmit={submit}><label>이름<input name="name" required autoFocus /></label><label>연락처<input name="contact" /></label><label>연령대<input name="ageGroup" placeholder="예: 20대" /></label><label>상담 유형<input name="service" placeholder="예: 개인상담" /></label><label>상담 시작일<input name="startedAt" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></label><label>다음 상담<input name="nextSessionAt" type="datetime-local" /></label><label className="wide">메모<textarea name="memo" rows={4} /></label><div className="adminModalActions wide"><button type="button" className="danger" onClick={onClose}>취소</button><button className="save" disabled={busy}>{busy ? "등록 중…" : "내담자 등록"}</button></div></form></section></div>;
}

function ClientModal({ client, busy, setBusy, onClose, onSaved }: { client: Client; busy: boolean; setBusy: (v: boolean) => void; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(client.name);
  const [contact, setContact] = useState(client.contact || "");
  const [status, setStatus] = useState(client.status);
  const [nextSessionAt, setNextSessionAt] = useState(toLocalInput(client.nextSessionAt));
  const [memo, setMemo] = useState(client.memo || "");
  const [sessionOpen, setSessionOpen] = useState(false);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    const response = await fetch("/api/admin/clients", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: client.id, ...payload }) });
    setBusy(false);
    if (!response.ok) { alert((await response.json().catch(() => ({}))).error || "저장하지 못했습니다."); return false; }
    return true;
  }

  async function save() { if (await patch({ name, contact, status, nextSessionAt, memo })) onSaved(); }

  async function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (await patch({ session: data })) onSaved();
  }

  return <div className="adminModalBackdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="adminModal clientModal"><button className="adminModalClose" onClick={onClose}>×</button><p className="sectionNumber">{client.clientCode}</p><h2>{client.name}</h2><div className="clientEditGrid"><label>이름<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>연락처<input value={contact} onChange={(e) => setContact(e.target.value)} /></label><label>상태<select value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((v) => <option key={v}>{v}</option>)}</select></label><label>다음 상담<input type="datetime-local" value={nextSessionAt} onChange={(e) => setNextSessionAt(e.target.value)} /></label><label className="wide">내담자 메모<textarea rows={4} value={memo} onChange={(e) => setMemo(e.target.value)} /></label></div>
    {client.sourceReason && <div className="sourceReason"><small>최초 신청 내용</small><p>{client.sourceReason}</p></div>}
    <div className="sessionSection"><div className="sessionHeading"><h3>회기 기록 <span>{client.sessionCount}</span></h3><button onClick={() => setSessionOpen((v) => !v)}>+ 회기 기록</button></div>{sessionOpen && <form className="sessionForm" onSubmit={addSession}><label>회기<input name="sessionNo" type="number" min="1" defaultValue={client.sessionCount + 1} /></label><label>상담일<input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></label><label className="wide">회기 요약<textarea name="summary" rows={5} required placeholder="주요 호소, 상담 내용, 관찰 등을 기록" /></label><label className="wide">다음 회기 계획<textarea name="nextPlan" rows={3} /></label><button className="workspacePrimary wide" disabled={busy}>{busy ? "저장 중…" : "회기 저장"}</button></form>}
      <div className="sessionList">{[...client.sessions].reverse().map((session) => <article key={session.id}><div><b>{session.sessionNo}회기</b><span>{session.date}</span></div><p>{session.summary || "요약 없음"}</p>{session.nextPlan && <small>다음 계획 · {session.nextPlan}</small>}</article>)}{client.sessions.length === 0 && <p className="sessionEmpty">아직 회기 기록이 없습니다.</p>}</div></div>
    <div className="adminModalActions"><button className="danger" onClick={onClose}>닫기</button><button className="save" onClick={save} disabled={busy}>{busy ? "저장 중…" : "변경사항 저장"}</button></div></section></div>;
}

function toLocalInput(value: string | null) { return value ? value.slice(0, 16) : ""; }
function formatDateTime(value: string | null) { if (!value) return "미정"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }); }
