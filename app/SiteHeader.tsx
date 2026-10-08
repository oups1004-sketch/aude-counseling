"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const sections = [
  ["about", "아우데 소개"],
  ["counseling", "상담 안내"],
  ["counselor", "상담자"],
  ["story", "사연 보내기"],
] as const;

export default function SiteHeader() {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/test-room";
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const [counselingOpen, setCounselingOpen] = useState(true);
  const [assessmentOpen, setAssessmentOpen] = useState(true);

  useEffect(() => {
    if (isAdmin) return;
    fetch("/api/counseling-status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setCounselingOpen(data.counselingOpen !== false);
        setAssessmentOpen(data.assessmentOpen !== false);
      })
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
  }, [isAdmin]);

  const openCounseling = () => {
    setMenuOpen(false);
    if (!counselingOpen && !assessmentOpen) {
      window.dispatchEvent(new Event("aude-counseling-closed"));
      return;
    }
    document.getElementById("counseling")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isAdmin) return null;

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
        <button className={`siteConsultCta${counselingOpen || assessmentOpen ? "" : " isDisabled"}`} type="button" aria-disabled={!counselingOpen && !assessmentOpen} onClick={openCounseling}>
          {counselingOpen ? "상담 신청하기" : assessmentOpen ? "심리검사 신청하기" : "현재 신청 마감"}
        </button>
      </nav>
    </header>
  );
}

