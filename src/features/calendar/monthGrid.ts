// 달력 한 달치 셀. 순수 함수 — 윤년·월 길이·요일 offset을 여기서 계산해 컴포넌트는 렌더만 한다
export interface MonthGrid {
  year: number;
  month: number; // 1~12
  cells: (string | null)[]; // null=선행 공백(일요일 시작 offset), 그 외 'YYYY-MM-DD'
}

// anchor: 'YYYY-MM' 또는 'YYYY-MM-DD' (앞 7자리만 사용)
export function buildMonthGrid(anchor: string): MonthGrid {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const leadBlanks = new Date(year, month - 1, 1).getDay(); // 0=일 ~ 6=토
  const daysInMonth = new Date(year, month, 0).getDate(); // 다음 달 0일 = 이번 달 말일
  const cells: (string | null)[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  const mm = String(month).padStart(2, '0');
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${mm}-${String(d).padStart(2, '0')}`);
  }
  // 항상 6행(42셀)으로 뒤를 채운다 — 월마다 행 수(4~6)가 달라지면 바텀시트 높이가 변해 상단 ◀▶가 튄다
  while (cells.length < 42) cells.push(null);
  return { year, month, cells };
}
