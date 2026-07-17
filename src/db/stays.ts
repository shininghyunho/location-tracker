import { Capacitor } from '@capacitor/core';
import { getDb } from './client';

export interface Stay {
  id: number;
  start_ts: string;
  end_ts: string;
  lat: number;
  lng: number;
  label: string | null;
  source: 'collector' | 'import';
}

export type NewStay = Omit<Stay, 'id'>;

// 웹 브라우저(npm run dev)에서는 SQLite 플러그인이 없으므로 메모리 배열로 대체한다
const isNative = Capacitor.isNativePlatform();
const webStays: Stay[] = [];

export async function insertStay(s: NewStay): Promise<void> {
  if (!isNative) {
    webStays.push({ ...s, id: webStays.length + 1 });
    return;
  }
  const db = await getDb();
  await db.run(
    'INSERT INTO stays (start_ts, end_ts, lat, lng, label, source) VALUES (?, ?, ?, ?, ?, ?)',
    [s.start_ts, s.end_ts, s.lat, s.lng, s.label, s.source],
  );
}

// 증분 판정의 커서 — 이 시각 이후의 points만 다시 판정하면 된다
export async function getLastCollectorStayEnd(): Promise<string | null> {
  if (!isNative) {
    const ends = webStays.filter((s) => s.source === 'collector').map((s) => s.end_ts);
    return ends.length ? ends.sort().at(-1)! : null;
  }
  const db = await getDb();
  const res = await db.query("SELECT MAX(end_ts) AS last FROM stays WHERE source = 'collector'");
  return (res.values?.[0]?.last ?? null) as string | null;
}

// ts가 로컬 오프셋 ISO 문자열이라 날짜는 앞 10자리 비교로 충분하다
export async function getStaysByDate(date: string): Promise<Stay[]> {
  if (!isNative) {
    return webStays
      .filter((s) => s.start_ts.startsWith(date))
      .sort((a, b) => (a.start_ts < b.start_ts ? -1 : 1));
  }
  const db = await getDb();
  const res = await db.query(
    'SELECT * FROM stays WHERE substr(start_ts, 1, 10) = ? ORDER BY start_ts',
    [date],
  );
  return (res.values ?? []) as Stay[];
}
