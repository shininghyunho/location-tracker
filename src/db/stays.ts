import { Capacitor } from '@capacitor/core';
import { getDb } from './client';
import { DEFAULT_STAY_PARAMS, haversineM } from '../features/stays/detectStays';

export interface Stay {
  id: number;
  start_ts: string;
  end_ts: string;
  lat: number;
  lng: number;
  label: string | null;
  source: 'collector' | 'import';
  // soft delete(0/1) — 행을 지우면 증분 커서가 뒤로 밀려 최신 stay가 재판정으로 부활한다
  deleted: number;
}

export type NewStay = Omit<Stay, 'id' | 'deleted'>;

// 웹 브라우저(npm run dev)에서는 SQLite 플러그인이 없으므로 메모리 배열로 대체한다
const isNative = Capacitor.isNativePlatform();
const webStays: Stay[] = [];

export async function insertStay(s: NewStay): Promise<void> {
  if (!isNative) {
    webStays.push({ ...s, id: webStays.length + 1, deleted: 0 });
    return;
  }
  const db = await getDb();
  await db.run(
    'INSERT INTO stays (start_ts, end_ts, lat, lng, label, source) VALUES (?, ?, ?, ?, ?, ?)',
    [s.start_ts, s.end_ts, s.lat, s.lng, s.label, s.source],
  );
}

// 증분 판정의 커서 — 이 시각 이후의 points만 다시 판정하면 된다.
// deleted도 포함해야 한다 — 지운 stay를 빼면 커서가 뒤로 밀려 그 stay가 재판정으로 부활한다
export async function getLastCollectorStayEnd(): Promise<string | null> {
  if (!isNative) {
    const ends = webStays.filter((s) => s.source === 'collector').map((s) => s.end_ts);
    return ends.length ? ends.sort().at(-1)! : null;
  }
  const db = await getDb();
  const res = await db.query("SELECT MAX(end_ts) AS last FROM stays WHERE source = 'collector'");
  return (res.values?.[0]?.last ?? null) as string | null;
}

export async function getAllStays(): Promise<Stay[]> {
  if (!isNative) {
    return webStays.filter((s) => !s.deleted).sort((a, b) => (a.start_ts < b.start_ts ? -1 : 1));
  }
  const db = await getDb();
  const res = await db.query('SELECT * FROM stays WHERE deleted = 0 ORDER BY start_ts');
  return (res.values ?? []) as Stay[];
}

// ts가 로컬 오프셋 ISO 문자열이라 날짜는 앞 10자리 비교로 충분하다
export async function getStaysByDate(date: string): Promise<Stay[]> {
  if (!isNative) {
    return webStays
      .filter((s) => !s.deleted && s.start_ts.startsWith(date))
      .sort((a, b) => (a.start_ts < b.start_ts ? -1 : 1));
  }
  const db = await getDb();
  const res = await db.query(
    'SELECT * FROM stays WHERE deleted = 0 AND substr(start_ts, 1, 10) = ? ORDER BY start_ts',
    [date],
  );
  return (res.values ?? []) as Stay[];
}

// 기간과 겹치는 stay 전부 — 경계에 걸친 체류 포함(통계 설계 §3). toTs는 배타
export async function getStaysByRange(fromTs: string, toTs: string): Promise<Stay[]> {
  if (!isNative) {
    return webStays
      .filter((s) => !s.deleted && s.end_ts >= fromTs && s.start_ts < toTs)
      .sort((a, b) => (a.start_ts < b.start_ts ? -1 : 1));
  }
  const db = await getDb();
  const res = await db.query(
    'SELECT * FROM stays WHERE deleted = 0 AND end_ts >= ? AND start_ts < ? ORDER BY start_ts',
    [fromTs, toTs],
  );
  return (res.values ?? []) as Stay[];
}

export async function deleteStay(id: number): Promise<void> {
  if (!isNative) {
    const target = webStays.find((s) => s.id === id);
    if (target) target.deleted = 1;
    return;
  }
  const db = await getDb();
  await db.run('UPDATE stays SET deleted = 1 WHERE id = ?', [id]);
}

// F5 라벨 매칭 반경 — 체류판정과 같은 설정값을 공유한다
const labelRadiusM = DEFAULT_STAY_PARAMS.radiusM;

export async function updateStayLabel(id: number, label: string | null): Promise<void> {
  if (!isNative) {
    const target = webStays.find((s) => s.id === id);
    if (target) target.label = label;
    return;
  }
  const db = await getDb();
  await db.run('UPDATE stays SET label = ? WHERE id = ?', [label, id]);
}

// 반경 내 라벨된 stay 중 가장 가까운 것의 라벨 — 새 stay 확정 시 자동 상속용
export async function findNearestLabel(lat: number, lng: number): Promise<string | null> {
  let best: { label: string; dist: number } | null = null;
  for (const s of await getAllStays()) {
    if (s.label === null) continue;
    const dist = haversineM(lat, lng, s.lat, s.lng);
    if (dist <= labelRadiusM && (!best || dist < best.dist)) best = { label: s.label, dist };
  }
  return best?.label ?? null;
}

export async function getNearbyLabels(lat: number, lng: number): Promise<string[]> {
  const labels = (await getAllStays())
    .filter((s) => s.label !== null && haversineM(lat, lng, s.lat, s.lng) <= labelRadiusM)
    .map((s) => s.label!);
  return [...new Set(labels)];
}

// F6 배치 삽입 — batchInsertPoints와 같은 구조. 행당 바인드 6개 × 150 = 900 ≤ 999.
// 웹 중복 검사가 deleted 포함 전체를 보는 것이 의도 — 지운 stay가 재-import로 부활하면 안 된다
const CHUNK = 150;

export async function batchInsertStays(
  stays: NewStay[],
  onChunk?: (n: number) => void,
): Promise<number> {
  let inserted = 0;
  if (!isNative) {
    for (const s of stays) {
      if (!webStays.some((w) => w.start_ts === s.start_ts && w.source === s.source)) {
        webStays.push({ ...s, id: webStays.length + 1, deleted: 0 });
        inserted++;
      }
    }
    onChunk?.(stays.length);
    return inserted;
  }
  const db = await getDb();
  for (let i = 0; i < stays.length; i += CHUNK) {
    const chunk = stays.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const values = chunk.flatMap((s) => [s.start_ts, s.end_ts, s.lat, s.lng, s.label, s.source]);
    const res = await db.run(
      `INSERT OR IGNORE INTO stays (start_ts, end_ts, lat, lng, label, source) VALUES ${placeholders}`,
      values,
    );
    inserted += res.changes?.changes ?? 0;
    onChunk?.(chunk.length);
  }
  return inserted;
}

export async function relabelNearbyUnlabeled(lat: number, lng: number, label: string): Promise<void> {
  const targets = (await getAllStays()).filter(
    (s) => s.label === null && haversineM(lat, lng, s.lat, s.lng) <= labelRadiusM,
  );
  for (const t of targets) await updateStayLabel(t.id, label);
}
