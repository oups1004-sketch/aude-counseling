export const assessmentStates = ["검사 전송", "해석 대기", "해석 완료"];
export function assessmentStatus(value: string): string {
  const legacy: Record<string, string> = { "실시 예정": "검사 전송", "결과 대기": "해석 대기", "해석 준비": "해석 대기", "해석상담 완료": "해석 완료" };
  return legacy[value] || value;
}
