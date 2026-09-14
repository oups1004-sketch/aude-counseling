import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "아우데 심리상담 | 용기를 내어, 당신의 이야기를",
  description: "관계, 진로, 가족과 감정의 어려움을 함께 살피는 온라인 심리상담. 당신이 지나온 이야기에서 새로운 가능성을 발견합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
