"use client";

import { useEffect, useState } from "react";

const sections = [
  ["about", "아우데 소개"],
  ["counseling", "상담 안내"],
  ["counselor", "상담자"],
  ["story", "사연 보내기"],
] as const;

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const [counselingOpen, setCounselingOpen] = useState(true);

  useEffect(() => {
    fetch("/api/counseling-status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setCounselingOpen(data.counselingOpen !== false))
      .catch(() => undefined);

    const updateActive = () => {
      const marker = window.scrollY + 150;
      let active = "";
      for (const [id] of sections) {
        const section = document.getElementById(id);
        if (section && section.offsetTop <= marker) active = id;
      }
      setActiveSection(active);
    };

    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  const openCounseling = () => {
    setMenuOpen(false);
    if (!counselingOpen) {
      window.dispatchEvent(new Event("aude-counseling-closed"));
      return;
    }
    document.getElementById("counseling")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header className="siteHeader">
      <a className="siteHeaderLogo" href="#top" aria-label="아우데 심리상담 홈">
        <img src="/aude-header-logo.webp" alt="AUDE" />
      </a>

      <button
        className="siteMenuButton"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="메뉴 열기"
      >
        <span />
        <span />
      </button>

      <nav className={menuOpen ? "siteNav open" : "siteNav"} aria-label="주요 메뉴">
        {sections.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className={activeSection === id ? "active" : ""}
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </a>
        ))}
        <button className={`siteConsultCta${counselingOpen ? "" : " isDisabled"}`} type="button" aria-disabled={!counselingOpen} onClick={openCounseling}>
          {counselingOpen ? "상담 신청하기" : "상담 신청 마감"}
        </button>
      </nav>
    </header>
  );
}
