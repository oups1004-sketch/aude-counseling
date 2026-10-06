"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { assessmentStatus } from "../lib/assessment-status";
import { assessmentReport, ReportData } from "./AssessmentReport";
import { sealData } from "./AssessmentSeal";

export type AssessmentRecord = {
  id: string; testName: string; date: string; status: string; scores: string; note: string;
  deliveryText?: string; interpretationDate: string; reaction: string; updatedAt: string;
  resultFile?: { name: string }; summaryFile?: { name: string };
};

const suggestions = ["MMPI-2", "TCI", "SCT", "HTP", "KFD", "TAT", "Rorschach", "MBTI", "기타 검사"];

export default function AssessmentRecords({ clientId, clientName, initial, onRecordsChange, onDirty }: { clientId: string; clientName: string; initial: AssessmentRecord[]; onRecordsChange?: (records: AssessmentRecord[]) => void; onDirty?: (dirty: boolean) => void }) {
  const [records, setRecords] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssessmentRecord | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const fileCount = records.reduce((count, record) => count + Number(!!record.resultFile) + Number(!!record.summaryFile), 0);

  useEffect(() => { onDirty?.(dirty || busy); }, [dirty, busy, onDirty]);
  useEffect(() => { if (!open) { setEditing(undefined); setDirty(false); } }, [open]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function start(record: AssessmentRecord | null) {
    if (busy || (dirty && !confirm("저장하지 않은 검사 파일 내용을 버릴까요?"))) return;
    setEditing(record); setDirty(false); setMessage("");
  }
  function showReport(record: AssessmentRecord) {
    const scores = [record.scores, record.note].filter(Boolean).join("\n\n");
    if (!scores.trim()) { setMessage("해석 내용을 먼저 기록해 주세요."); return; }
    const data: ReportData = { ...record, clientName, scores };
    setPreviewReady(false); setPreview(assessmentReport(data, sealData));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("clientId", clientId);
    if (editing) { form.set("recordId", editing.id); form.set("updatedAt", editing.updatedAt); }
    try {
      const response = await fetch("/api/admin/assessments", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "저장하지 못했습니다.");
      setRecords(result.records); onRecordsChange?.(result.records); setEditing(undefined); setDirty(false); setMessage("심리검사지 파일을 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결을 확인해 주세요."); }
    finally { setBusy(false); }
  }
  const fileUrl = (record: AssessmentRecord, kind: "result" | "summary") => `/api/admin/assessments?clientId=${encodeURIComponent(clientId)}&recordId=${encodeURIComponent(record.id)}&kind=${kind}`;

  return <section className="sessionSection assessmentDrawer">
    <button type="button" className="assessmentDrawerTrigger" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span><small>PRIVATE FILE DRAWER</small><strong>심리검사지</strong><em>{fileCount ? `${fileCount}개 파일` : "파일 없음"}</em></span><b aria-hidden="true">{open ? "−" : "+"}</b>
    </button>
    {open && <div className="assessmentDrawerBody">
      <p className="editHint">검사별로 PDF 한 장씩 보관합니다. 저장한 뒤에는 파일명을 눌러 다시 열 수 있어요.</p>
      {message && <p className="assessmentMessage" role="status">{message}</p>}
      <div className="assessmentSlots">
        {records.map(record => <article className="assessmentSlot" key={record.id}>
          <div className="assessmentSlotTitle"><div><b>{record.testName}</b><small>{record.date || "실시일 미정"} · {assessmentStatus(record.status)}</small></div><button type="button" onClick={() => start(record)}>파일 {record.resultFile || record.summaryFile ? "교체" : "첨부"}</button></div>
          {record.resultFile || record.summaryFile ? <div className="assessmentStoredFiles">{record.resultFile && <a target="_blank" rel="noreferrer" href={fileUrl(record, "result")}>⌁ {record.resultFile.name}<span>열기 ↗</span></a>}{record.summaryFile && <a target="_blank" rel="noreferrer" href={fileUrl(record, "summary")}>⌁ {record.summaryFile.name}<span>열기 ↗</span></a>}</div> : <p className="assessmentSlotEmpty">아직 첨부된 파일이 없습니다.</p>}
          {(record.scores || record.reaction) && <details className="assessmentRecordNotes"><summary>검사 기록 보기</summary>{record.scores && <p><strong>심리검사 해석</strong><br />{record.scores}</p>}{record.reaction && <p><strong>상담 내용</strong><br />{record.reaction}</p>}</details>}
          <button type="button" className="assessmentReportButton" onClick={() => showReport(record)}>해석본 PDF 만들기</button>
        </article>)}
      </div>
      {editing === null ? <form className="assessmentSlotForm" onSubmit={submit} onChange={() => setDirty(true)}>
        <label>검사명<input name="testName" list="assessment-tests" required placeholder="예: MMPI-2" autoFocus /></label><datalist id="assessment-tests">{suggestions.map(name => <option key={name} value={name} />)}</datalist>
        <label>실시일<input name="date" type="date" /></label><input type="hidden" name="status" value="해석 대기" /><input type="hidden" name="scores" value="" /><input type="hidden" name="note" value="" /><input type="hidden" name="interpretationDate" value="" /><input type="hidden" name="reaction" value="" />
        <label className="assessmentDropzone"><span>심리검사지 PDF</span><input name="resultFile" type="file" accept="application/pdf,.pdf" required /><small>PDF · 최대 3MB</small></label>
        <div className="assessmentSlotActions"><button type="button" disabled={busy} onClick={() => { setEditing(undefined); setDirty(false); }}>취소</button><button className="workspacePrimary" disabled={busy}>{busy ? "저장 중…" : "파일 저장"}</button></div>
      </form> : editing ? <form className="assessmentSlotForm assessmentReplaceForm" onSubmit={submit} onChange={() => setDirty(true)}>
        <input type="hidden" name="testName" value={editing.testName} /><input type="hidden" name="date" value={editing.date} /><input type="hidden" name="status" value={assessmentStatus(editing.status)} /><input type="hidden" name="scores" value={editing.scores || ""} /><input type="hidden" name="note" value={editing.note || ""} /><input type="hidden" name="interpretationDate" value={editing.interpretationDate || ""} /><input type="hidden" name="reaction" value={editing.reaction || ""} />
        <label className="assessmentDropzone"><span>{editing.testName} 파일 {editing.resultFile ? "교체" : "첨부"}</span><input name="resultFile" type="file" accept="application/pdf,.pdf" required /><small>새 파일을 저장하면 기존 파일을 대체합니다.</small></label>
        <div className="assessmentSlotActions"><button type="button" disabled={busy} onClick={() => { setEditing(undefined); setDirty(false); }}>취소</button><button className="workspacePrimary" disabled={busy}>{busy ? "저장 중…" : "파일 저장"}</button></div>
      </form> : <button type="button" className="assessmentAddSlot" onClick={() => start(null)}>+ 심리검사지 슬롯 추가</button>}
    </div>}
    {preview && <div role="dialog" aria-modal="true" aria-label="해석본 PDF 미리보기" className="assessmentPreview"><section><div><strong>해석본 PDF 미리보기</strong><span>인쇄 창에서 ‘PDF로 저장’을 선택해 주세요.</span><button type="button" disabled={!previewReady} onClick={() => { previewRef.current?.contentWindow?.focus(); previewRef.current?.contentWindow?.print(); }}>PDF 저장</button><button type="button" autoFocus onClick={() => setPreview(null)}>닫기</button></div><iframe ref={previewRef} title="해석보고서 미리보기" srcDoc={preview} onLoad={() => setPreviewReady(true)} /></section></div>}
  </section>;
}
