// 검색 기록 — 기기 로컬 성격이라 DB 대신 localStorage(최근 순, 최대 10개)
const KEY = 'searchHistory';
const MAX = 10;

export function getSearchHistory(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function pushSearchHistory(label: string): string[] {
  const next = [label, ...getSearchHistory().filter((l) => l !== label)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeSearchHistory(label: string): string[] {
  const next = getSearchHistory().filter((l) => l !== label);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
