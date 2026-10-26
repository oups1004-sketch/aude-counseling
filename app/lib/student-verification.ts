export type StudentVerification = {
  kind: '대학생' | '대학원생';
  registeredAt: string;
  updatedAt: string;
  file: { id: string; name: string; mime: string; size: number };
};
export function studentVerification(value: unknown): StudentVerification | null {
  const v = value as StudentVerification | null;
  return v && ['대학생', '대학원생'].includes(v.kind) && v.file && /^[a-f0-9-]{36}$/i.test(v.file.id) && v.updatedAt ? v : null;
}
export function counselingFee(value: unknown, kind: string) {
  return kind === '개인상담' && studentVerification(value) ? 80000 : 100000;
}
