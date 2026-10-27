"use client";

import { useEffect, useRef, useState } from "react";
import "./story-confirmation.css";

export default function StoryConfirmation({ adaptation, busy, error, onClose, onSend }: {
  adaptation: boolean; busy: boolean; error: string; onClose: () => void; onSend: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="storyConfirmation" aria-labelledby="story-confirmation-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button type="button" className="storyConfirmationClose" disabled={busy} onClick={onClose} aria-label="작성 화면으로 돌아가기">×</button>
    <p className="sectionNumber">보내기 전 마지막 확인</p>
    <h2 id="story-confirmation-title">사연 소개에<br />동의하시나요?</h2>
    <p>보내주신 사연은 개인정보를 제외한 뒤, <strong>‘외삼춘 상담소’의 영상·콘텐츠에서 소개될 수 있습니다.</strong></p>
    {adaptation && <p className="adaptationNotice">각색 요청이 함께 전달됩니다. 인물 관계나 상황 등 일부 내용을 바꾸어 소개합니다.</p>}
    <label className="check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /><span>위 내용을 확인했으며, 사연 소개에 동의합니다. (필수)</span></label>
    {error && <p className="formError" role="alert">{error}</p>}
    <div className="storyConfirmationActions"><button type="button" disabled={busy} onClick={onClose}>돌아가서 수정</button><button className="submitButton" type="button" disabled={!consent || busy} onClick={onSend}>{busy ? "보내는 중…" : "동의하고 사연 보내기"}</button></div>
  </dialog>;
}
