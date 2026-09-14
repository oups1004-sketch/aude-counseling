import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "아우데 심리상담 | 용기를 내어, 당신의 이야기를",
  description: "아들러와 내러티브 관점으로 함께하는 온라인 심리상담. 지금의 이야기를 안전하게 꺼내어 놓으세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
