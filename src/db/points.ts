import { Capacitor } from '@capacitor/core';
import { getDb } from './client';

export interface Point {
  id: number;
  ts: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  source: 'collector' | 'import';
}

export type NewPoint = Omit<Point, 'id'>;

// 웹 브라우저(npm run dev)에서는 SQLite 플러그인이 없으므로 메모리 배열로 대체한다
const isNative = Capacitor.isNativePlatform();
const webPoints: Point[] = [];

export async function insertPoint(p: NewPoint): Promise<void> {
  if (!isNative) {
    webPoints.push({ ...p, id: webPoints.length + 1 });
    return;
  }
  const db = await getDb();
  await db.run(
    'INSERT INTO points (ts, lat, lng, accuracy_m, source) VALUES (?, ?, ?, ?, ?)',
    [p.ts, p.lat, p.lng, p.accuracy_m, p.source],
  );
}

export async function getRecentPoints(limit = 50): Promise<Point[]> {
  if (!isNative) return [...webPoints].reverse().slice(0, limit);
  const db = await getDb();
  const res = await db.query('SELECT * FROM points ORDER BY id DESC LIMIT ?', [limit]);
  return (res.values ?? []) as Point[];
}

// 체류지 판정(F2)의 증분 입력 — 마지막 확정 stay 이후의 collector points만
export async function getCollectorPointsAfter(ts: string | null): Promise<Point[]> {
  if (!isNative) {
    return webPoints.filter((p) => p.source === 'collector' && (ts === null || p.ts > ts));
  }
  const db = await getDb();
  const res = ts === null
    ? await db.query("SELECT * FROM points WHERE source = 'collector' ORDER BY ts")
    : await db.query("SELECT * FROM points WHERE source = 'collector' AND ts > ? ORDER BY ts", [ts]);
  return (res.values ?? []) as Point[];
}

// ts가 로컬 오프셋 ISO 문자열이라 날짜는 앞 10자리 비교로 충분하다 (SQLite date()는 UTC 변환이라 부적합)
export async function getPointsByDate(date: string): Promise<Point[]> {
  if (!isNative) {
    return webPoints.filter((p) => p.ts.startsWith(date)).sort((a, b) => (a.ts < b.ts ? -1 : 1));
  }
  const db = await getDb();
  const res = await db.query('SELECT * FROM points WHERE substr(ts, 1, 10) = ? ORDER BY ts', [date]);
  return (res.values ?? []) as Point[];
}

export async function countPoints(): Promise<number> {
  if (!isNative) return webPoints.length;
  const db = await getDb();
  const res = await db.query('SELECT COUNT(*) AS cnt FROM points');
  return (res.values?.[0]?.cnt ?? 0) as number;
}
