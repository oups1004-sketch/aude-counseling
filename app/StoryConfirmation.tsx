"use client";

import { useEffect, useRef, useState } from "react";
import "./story-confirmation.css";

export default function StoryConfirmation({ busy, error, onClose, onSend }: {
  busy: boolean; error: string; onClose: () => void; onSend: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [consent, setConsent] = useState(false);
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    setDelayed(false);
    if (!busy) return;
    const timer = setTimeout(() => setDelayed(true), 8000);
    return () => clearTimeout(timer);
  }, [busy]);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className="storyConfirmation" aria-labelledby="story-confirmation-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button type="button" className="storyConfirmationClose" disabled={busy} onClick={onClose} aria-label="작성 화면으로 돌아가기">×</button>
    <p className="sectionNumber">보내기 전 마지막 확인</p>
    <h2 id="story-confirmation-title">사연 소개에<br />동의하시나요?</h2>
    <p>보내주신 사연은 개인정보를 제외한 뒤, <strong>‘외삼춘 상담소’의 영상·콘텐츠에서 소개될 수 있습니다.</strong></p>
    <label className="check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /><span>위 내용을 확인했으며, 사연 소개에 동의합니다. (필수)</span></label>
    {error && <p className="formError" role="alert">{error}</p>}
    {error && <p className="storyRetryHint">연결 오류가 있었다면 이미 접수되었을 수도 있습니다. 이 화면에서 같은 내용으로 다시 보내면 중복 저장하지 않습니다. 내용을 바꾸어 보내면 새 사연으로 접수됩니다.</p>}
    {busy && <p role="status">{delayed ? "접수 확인이 늦어지고 있어요. 잠시만 기다려 주세요. 응답이 없으면 다시 시도할 수 있도록 안내해 드립니다." : "사연을 안전하게 전달하고 있어요."}</p>}
    <div className="storyConfirmationActions"><button type="button" disabled={busy} onClick={onClose}>돌아가서 수정</button><button className="submitButton" type="button" disabled={!consent || busy} onClick={onSend}>{busy ? "보내는 중…" : "동의하고 사연 보내기"}</button></div>
  </dialog>;
}

