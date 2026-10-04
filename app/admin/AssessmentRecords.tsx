"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { assessmentReport, ReportData } from "./AssessmentReport";
import { assessmentStates, assessmentStatus } from "../lib/assessment-status";
import { sealData } from "./AssessmentSeal";
export type AssessmentRecord = {
  id: string; testName: string; date: string; status: string; scores: string; note: string;
  deliveryText?: string; interpretationDate: string; reaction: string; updatedAt: string;
  resultFile?: { name: string }; summaryFile?: { name: string };
};
function interpretation(record?: AssessmentRecord | null) {
  return [record?.scores, record?.note].filter(Boolean).join("\n\n");
}
export default function AssessmentRecords({ clientId, clientName, initial, onRecordsChange, onDirty }: { clientId: string; clientName: string; initial: AssessmentRecord[]; onRecordsChange?: (records: AssessmentRecord[]) => void; onDirty?: (dirty: boolean) => void }) {
  const [records, setRecords] = useState(initial);
  const [editing, setEditing] = useState<AssessmentRecord | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  function showReport(record?: AssessmentRecord) {
    const form = !record && formRef.current ? new FormData(formRef.current) : null;
    const get = (key: string) => String(form?.get(key) ?? "");
    const data: ReportData = record ? { ...record, clientName, scores: interpretation(record) } : { clientName, testName: get("testName"), date: get("date"), interpretationDate: get("interpretationDate"), scores: get("scores") };
    if (!data.testName.trim()) { setMessage("검사명을 먼저 작성해 주세요."); return; }
    if (!data.scores.trim()) { setMessage("심리검사 해석 내용을 먼저 작성해 주세요."); return; }
    setPreviewReady(false); setPreview(assessmentReport(data, sealData));
  }

  useEffect(() => { onDirty?.(dirty || busy); }, [dirty, busy, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("clientId", clientId);
    if (editing) { form.set("recordId", editing.id); form.set("updatedAt", editing.updatedAt); }
    try {
      const response = await fetch("/api/admin/assessments", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "저장하지 못했습니다.");
      setRecords(result.records); onRecordsChange?.(result.records); setEditing(undefined); setDirty(false); setMessage("✓ 검사 기록을 저장했어요");
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결을 확인해 주세요."); }
    finally { setBusy(false); }
  }
  function changeEditing(record: AssessmentRecord | null | undefined) {
    if (busy || dirty && !confirm("저장하지 않은 검사 내용을 버릴까요?")) return;
    setEditing(record); setDirty(false); setMessage("");
  }
  const fileUrl = (record: AssessmentRecord, kind: string) => `/api/admin/assessments?clientId=${encodeURIComponent(clientId)}&recordId=${encodeURIComponent(record.id)}&kind=${kind}`;
  return <section className="sessionSection assessmentSection">
    <div className="sessionHeading"><h3>심리검사 <span>{records.length}</span></h3><button type="button" onClick={() => changeEditing(null)}>+ 검사 기록</button></div>
    <p className="editHint">검사 결과와 해석 내용을 내담자별로 보관합니다. PDF는 각각 3MB, 두 파일 합계 4MB까지 첨부할 수 있습니다.</p>
    {message && <p className="assessmentMessage" role="status">{message}</p>}
    {editing !== undefined && <form ref={formRef} key={editing?.id || "new"} className="sessionForm assessmentForm" onSubmit={submit} onChange={() => setDirty(true)}>
      <label>검사명<input name="testName" defaultValue={editing?.testName} maxLength={100} required placeholder="예: MMPI-2, MBTI, SCT" /></label>
      <label>실시일<input name="date" type="date" defaultValue={editing?.date} /></label>
      <label>진행 상태<select name="status" defaultValue={assessmentStatus(editing?.status || "검사 전송")}>{assessmentStates.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>해석상담일<input name="interpretationDate" type="date" defaultValue={editing?.interpretationDate} /></label>
      <label className="wide">심리검사 해석<textarea name="scores" rows={5} maxLength={16000} defaultValue={interpretation(editing)} placeholder="검사 결과와 주요 특징, 해석 내용을 작성해 주세요" /></label>
      <input name="note" type="hidden" value="" />
      <label className="wide">상담 내용<textarea name="reaction" rows={5} maxLength={4000} defaultValue={editing?.reaction} placeholder="심리검사 해석 과정에서 나눈 상담 내용과 내담자 반응을 작성해 주세요" /></label>
      <label>결과 PDF<input name="resultFile" type="file" accept="application/pdf,.pdf" />{editing?.resultFile && <small>기존: {editing.resultFile.name} · 새 파일 선택 시 교체</small>}</label>
      <label>요약 해석본 PDF<input name="summaryFile" type="file" accept="application/pdf,.pdf" />{editing?.summaryFile && <small>기존: {editing.summaryFile.name} · 새 파일 선택 시 교체</small>}</label>
      <div className="assessmentFormActions wide"><button type="button" disabled={busy} onClick={() => changeEditing(undefined)}>취소</button><button className="workspacePrimary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button><button type="button" disabled={busy} onClick={() => showReport()}>해석본 PDF</button></div>
      <p className="editHint wide">PDF 미리보기는 현재 작성 내용을 반영합니다. 사이트에 보관하려면 저장을 눌러 주세요.</p>
    </form>}
    <div className="sessionList">{records.map(record => <article key={record.id}>
      <div><b>{record.testName}</b><span className="assessmentBadge">{assessmentStatus(record.status)}</span></div>
      <small>실시일 {record.date || "미정"}{record.interpretationDate ? ` · 해석상담 ${record.interpretationDate}` : ""}</small>
      {interpretation(record) && <p><strong>심리검사 해석</strong><br/>{interpretation(record)}</p>}
      {record.reaction && <p><strong>상담 내용</strong><br/>{record.reaction}</p>}
      <div className="assessmentFileActions">{record.resultFile && <a href={fileUrl(record, "result")}>결과 PDF ↓</a>}{record.summaryFile && <a href={fileUrl(record, "summary")}>요약 해석본 ↓</a>}<button type="button" onClick={() => changeEditing(record)}>수정</button><button type="button" onClick={() => showReport(record)}>해석본 PDF</button></div>
    </article>)}
    {!records.length && <p className="sessionEmpty">검사 기록을 추가해 결과와 해석 내용을 정리해 보세요.</p>}</div>
    {preview && <div role="dialog" aria-modal="true" aria-label="PDF 미리보기" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.55)", padding: "3vh 3vw" }}><section style={{ background: "#fff", height: "94vh", maxWidth: 950, margin: "auto", display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden" }}><div style={{ padding: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}><strong>PDF 미리보기</strong><span style={{ flex: 1 }}>인쇄 창에서 ‘PDF로 저장’을 선택해 주세요.</span><button type="button" disabled={!previewReady} onClick={() => { previewRef.current?.contentWindow?.focus(); previewRef.current?.contentWindow?.print(); }}>PDF 저장</button><button type="button" autoFocus onClick={() => setPreview(null)}>닫기</button></div><iframe ref={previewRef} title="해석보고서 미리보기" srcDoc={preview} onLoad={() => setPreviewReady(true)} style={{ flex: 1, width: "100%", border: 0 }} /></section></div>}
  </section>;
}
