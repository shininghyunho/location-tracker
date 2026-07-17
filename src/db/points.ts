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

export async function countPoints(): Promise<number> {
  if (!isNative) return webPoints.length;
  const db = await getDb();
  const res = await db.query('SELECT COUNT(*) AS cnt FROM points');
  return (res.values?.[0]?.cnt ?? 0) as number;
}
