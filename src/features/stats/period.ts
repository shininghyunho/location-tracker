import { addDaysStr, dayStartTs, toDate, toDateStr } from '../../lib/date';

// 기간 경계를 ts와 같은 +09:00 고정 포맷 문자열로 만들어 사전순 비교로 자른다 — 단일 타임존 가정(설계 §3)
export type PeriodUnit = 'week' | 'month';

// 주는 월요일 시작(설계 §결정 표)
export function startOfPeriod(unit: PeriodUnit, dateStr: string): string {
  if (unit === 'month') return `${dateStr.slice(0, 7)}-01`;
  const d = toDate(dateStr);
  const fromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - fromMonday);
  return toDateStr(d);
}

export function shiftPeriod(unit: PeriodUnit, anchor: string, delta: number): string {
  if (unit === 'week') return addDaysStr(anchor, delta * 7);
  const d = toDate(anchor);
  d.setMonth(d.getMonth() + delta);
  return startOfPeriod('month', toDateStr(d));
}

export interface PeriodRange {
  fromTs: string;
  toTs: string; // 배타 — 다음 기간 시작 자정
}

export function periodRange(unit: PeriodUnit, anchor: string): PeriodRange {
  return { fromTs: dayStartTs(anchor), toTs: dayStartTs(shiftPeriod(unit, anchor, 1)) };
}

export function periodLabel(unit: PeriodUnit, anchor: string): string {
  if (unit === 'month') return anchor.slice(0, 7);
  return `${anchor} ~ ${addDaysStr(anchor, 6).slice(5)}`;
}

export function isCurrentPeriod(unit: PeriodUnit, anchor: string, today: string): boolean {
  return startOfPeriod(unit, today) === anchor;
}
