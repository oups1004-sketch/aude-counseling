"use client";
import { FormEvent, useEffect, useState } from "react";
export type AssessmentRecord = {
  id: string; testName: string; date: string; status: string; scores: string; note: string;
  interpretationDate: string; reaction: string; updatedAt: string;
  resultFile?: { name: string }; summaryFile?: { name: string };
};
export default function AssessmentRecords({ clientId, initial, onRecordsChange, onDirty }: { clientId: string; initial: AssessmentRecord[]; onRecordsChange?: (records: AssessmentRecord[]) => void; onDirty?: (dirty: boolean) => void }) {
  const [records, setRecords] = useState(initial);
  const [editing, setEditing] = useState<AssessmentRecord | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);

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
    {editing !== undefined && <form key={editing?.id || "new"} className="sessionForm assessmentForm" onSubmit={submit} onChange={() => setDirty(true)}>
      <label>검사명<input name="testName" defaultValue={editing?.testName} maxLength={100} required placeholder="예: MMPI-2, MBTI, SCT" /></label>
      <label>실시일<input name="date" type="date" defaultValue={editing?.date} /></label>
      <label>진행 상태<select name="status" defaultValue={editing?.status || "실시 예정"}>{["실시 예정", "결과 대기", "해석 준비", "해석상담 완료"].map(s => <option key={s}>{s}</option>)}</select></label>
      <label>해석상담일<input name="interpretationDate" type="date" defaultValue={editing?.interpretationDate} /></label>
      <label className="wide">주요 점수·유형<textarea name="scores" rows={3} maxLength={4000} defaultValue={editing?.scores} placeholder="척도와 T점수, MBTI 유형 등을 기록" /></label>
      <label className="wide">해석 메모<textarea name="note" rows={5} maxLength={8000} defaultValue={editing?.note} placeholder="주요 특징, 상담에서 확인할 내용" /></label>
      <label className="wide">해석상담 기록·내담자 반응<textarea name="reaction" rows={3} maxLength={4000} defaultValue={editing?.reaction} /></label>
      <label>결과 PDF<input name="resultFile" type="file" accept="application/pdf,.pdf" />{editing?.resultFile && <small>기존: {editing.resultFile.name} · 새 파일 선택 시 교체</small>}</label>
      <label>요약 해석본 PDF<input name="summaryFile" type="file" accept="application/pdf,.pdf" />{editing?.summaryFile && <small>기존: {editing.summaryFile.name} · 새 파일 선택 시 교체</small>}</label>
      <div className="assessmentFormActions wide"><button type="button" disabled={busy} onClick={() => changeEditing(undefined)}>취소</button><button className="workspacePrimary" disabled={busy}>{busy ? "저장 중…" : "검사 기록 저장"}</button></div>
    </form>}
    <div className="sessionList">{records.map(record => <article key={record.id}>
      <div><b>{record.testName}</b><span className="assessmentBadge">{record.status}</span></div>
      <small>실시일 {record.date || "미정"}{record.interpretationDate ? ` · 해석상담 ${record.interpretationDate}` : ""}</small>
      {record.scores && <p><strong>주요 점수·유형</strong><br/>{record.scores}</p>}
      {record.note && <p><strong>해석 메모</strong><br/>{record.note}</p>}
      {record.reaction && <p><strong>해석상담 기록</strong><br/>{record.reaction}</p>}
      <div className="assessmentFileActions">{record.resultFile && <a href={fileUrl(record, "result")}>결과 PDF ↓</a>}{record.summaryFile && <a href={fileUrl(record, "summary")}>요약 해석본 ↓</a>}<button type="button" onClick={() => changeEditing(record)}>수정</button></div>
    </article>)}
    {!records.length && <p className="sessionEmpty">검사 기록을 추가해 결과와 해석 내용을 정리해 보세요.</p>}</div>
  </section>;
}
