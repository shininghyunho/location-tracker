import { Capacitor } from '@capacitor/core';
import { getDb } from './client';
import { toLocalIso } from '../lib/localIso';

export type AppLogLevel = 'info' | 'warn' | 'error';

export interface AppLog {
  id: number;
  ts: string;
  level: AppLogLevel;
  tag: string;
  message: string;
}

const isNative = Capacitor.isNativePlatform();
const webLogs: AppLog[] = [];

// 오류 처리 경로에서 호출되므로 절대 throw하지 않는다
export async function appLog(level: AppLogLevel, tag: string, message: string): Promise<void> {
  const ts = toLocalIso(Date.now());
  console[level](`[${tag}] ${message}`);
  try {
    if (!isNative) {
      webLogs.push({ id: webLogs.length + 1, ts, level, tag, message });
      return;
    }
    const db = await getDb();
    await db.run('INSERT INTO logs (ts, level, tag, message) VALUES (?, ?, ?, ?)', [
      ts,
      level,
      tag,
      message,
    ]);
  } catch (e) {
    console.error('[appLog] 저장 실패:', e);
  }
}

export async function getRecentLogs(limit = 100): Promise<AppLog[]> {
  if (!isNative) return [...webLogs].reverse().slice(0, limit);
  const db = await getDb();
  const res = await db.query('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit]);
  return (res.values ?? []) as AppLog[];
}

export async function getAllLogs(): Promise<AppLog[]> {
  if (!isNative) return [...webLogs];
  const db = await getDb();
  const res = await db.query('SELECT * FROM logs ORDER BY id');
  return (res.values ?? []) as AppLog[];
}
