// 날짜 문자열(YYYY-MM-DD)·시간 표기 공용 유틸 — 단일 타임존 가정(설계 §3)

// 정오 기준 Date — 자정 기준이면 타임존 경계에서 날짜가 밀릴 수 있다
export function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDaysStr(dateStr: string, delta: number): string {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}

export function dayStartTs(dateStr: string): string {
  return `${dateStr}T00:00:00.000+09:00`;
}

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}시간 ${min % 60}분` : `${min}분`;
}
