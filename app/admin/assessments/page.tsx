"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AssessmentRecords, { AssessmentRecord } from "../AssessmentRecords";
import { assessmentStates, assessmentStatus } from "../../lib/assessment-status";
type Client = { id: string; name: string; clientCode: string; assessments: AssessmentRecord[] };
export default function AssessmentsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("전체");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/admin/clients", { cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error(r.status === 401 ? "관리자 로그인이 필요합니다." : "검사 목록을 불러오지 못했습니다.");
      setClients(await r.json());
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const selected = clients.find(c => c.id === selectedId);
  const rows = clients.flatMap(c => (c.assessments || []).map(r => ({ client: c, record: r })))
    .filter(({ client, record }) => (status === "전체" || assessmentStatus(record.status) === status) && [client.name, client.clientCode, record.testName].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <main className="adminShell">
    <header className="adminHeader workspaceHeader"><div><Link className="adminBrand" href="/admin">AUDE</Link><span>통합 관리</span></div><nav><Link href="/admin">접수</Link><Link href="/admin/clients">내담자</Link><Link href="/admin/assessments" className="active">심리검사</Link></nav><Link className="adminHomeLink" href="/" target="_blank" rel="noopener noreferrer">홈페이지 보기 ↗</Link></header>
    <section className="adminDashboard workspacePage">
      <div className="workspaceHeading"><div><p className="sectionNumber">ASSESSMENT DESK</p><h1>심리검사 관리</h1><p>내담자별 검사 전송, 해석 대기·완료와 해석상담 기록을 관리합니다.</p></div></div>
      {loading ? <p>검사 기록을 불러오는 중…</p> : error ? <p className="adminError">{error} <Link href="/admin">관리자 페이지로</Link></p> : <>
      <div className="clientToolbar"><input aria-label="검사 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·내담자 코드·검사명 검색" /><select aria-label="검사 상태 필터" value={status} onChange={e => setStatus(e.target.value)}>{["전체", ...assessmentStates].map(s => <option key={s}>{s}</option>)}</select></div>
      <label className="adminField">검사 기록을 정리할 내담자<select value={selectedId} onChange={e => { if (!dirty || confirm("저장하지 않은 검사 내용을 버리고 다른 내담자를 열까요?")) { setSelectedId(e.target.value); setDirty(false); } }}><option value="">내담자를 선택해 주세요</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.clientCode}</option>)}</select></label>
      {selected && <div className="assessmentClientPanel"><h2>{selected.name}</h2><Link href={`/admin/clients?client=${selected.id}`}>내담자 기록 열기 ↗</Link><AssessmentRecords key={selected.id} clientName={selected.name} clientId={selected.id} initial={selected.assessments || []} onDirty={setDirty} onRecordsChange={records => setClients(current => current.map(c => c.id === selected.id ? { ...c, assessments: records } : c))} /></div>}
      {!selected && <div className="sessionList">{rows.map(({ client, record }) => <article key={record.id}><div><b>{client.name} · {record.testName}</b><span>{assessmentStatus(record.status)}</span></div><small>{record.date || "실시일 미정"} · {client.clientCode}</small><button className="clientConvert" onClick={() => setSelectedId(client.id)}>검사 기록 열기</button></article>)}{!rows.length && <p className="adminEmpty">표시할 검사 기록이 없습니다. 위에서 내담자를 선택해 검사 기록을 추가해 주세요.</p>}</div>}</>}
    </section>
  </main>;
}
