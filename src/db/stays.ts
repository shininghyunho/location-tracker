import { Capacitor } from '@capacitor/core';
import { getDb } from './client';
import { DEFAULT_STAY_PARAMS } from '../features/stays/stayParams';
import { haversineM } from '../lib/geo';
import { addDaysStr } from '../lib/date';

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

// 새로 생긴 row의 id를 돌려준다 — 진행 중 클러스터를 즉시 저장하고 그 stay로 라벨 시트를 열 때 쓴다
export async function insertStay(s: NewStay): Promise<number> {
  if (!isNative) {
    const id = webStays.length + 1;
    webStays.push({ ...s, id, deleted: 0 });
    return id;
  }
  const db = await getDb();
  const res = await db.run(
    'INSERT INTO stays (start_ts, end_ts, lat, lng, label, source) VALUES (?, ?, ?, ?, ?, ?)',
    [s.start_ts, s.end_ts, s.lat, s.lng, s.label, s.source],
  );
  return res.changes?.lastId ?? -1;
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

// 블랙아웃 이어붙이기용 — end_ts가 가장 늦은 collector 체류(삭제분 포함, 커서와 일치시키려고).
// 이어붙일지는 호출부가 deleted를 보고 판단한다 — 지운 체류를 되살려선 안 된다.
export async function getLastCollectorStay(): Promise<Stay | null> {
  if (!isNative) {
    const collector = webStays.filter((s) => s.source === 'collector');
    if (!collector.length) return null;
    return collector.reduce((a, b) => (a.end_ts >= b.end_ts ? a : b));
  }
  const db = await getDb();
  const res = await db.query(
    "SELECT * FROM stays WHERE source = 'collector' ORDER BY end_ts DESC LIMIT 1",
  );
  return (res.values?.[0] ?? null) as Stay | null;
}

// 이어붙이기: 정지 공백 뒤 같은 장소 재수집이면 직전 체류의 끝을 늘린다
export async function updateStayEnd(id: number, endTs: string): Promise<void> {
  if (!isNative) {
    const target = webStays.find((s) => s.id === id);
    if (target) target.end_ts = endTs;
    return;
  }
  const db = await getDb();
  await db.run('UPDATE stays SET end_ts = ? WHERE id = ?', [endTs, id]);
}

export async function getAllStays(): Promise<Stay[]> {
  if (!isNative) {
    return webStays.filter((s) => !s.deleted).sort((a, b) => (a.start_ts < b.start_ts ? -1 : 1));
  }
  const db = await getDb();
  const res = await db.query('SELECT * FROM stays WHERE deleted = 0 ORDER BY start_ts');
  return (res.values ?? []) as Stay[];
}

// ts가 로컬 오프셋 ISO 문자열이라 날짜는 앞 10자리 비교로 충분하다.
// 시작일만 보면 자정 넘긴 체류가 종료일 화면에서 빠진다(달력 점은 찍히는데 목록은 빔).
// 그래서 date에 '걸친' 체류를 모두 반환한다 — 시작일 ≤ date ≤ 종료일.
export async function getStaysByDate(date: string): Promise<Stay[]> {
  if (!isNative) {
    return webStays
      .filter((s) => !s.deleted && s.start_ts.slice(0, 10) <= date && s.end_ts.slice(0, 10) >= date)
      .sort((a, b) => (a.start_ts < b.start_ts ? -1 : 1));
  }
  const db = await getDb();
  const res = await db.query(
    'SELECT * FROM stays WHERE deleted = 0 AND substr(start_ts, 1, 10) <= ? AND substr(end_ts, 1, 10) >= ? ORDER BY start_ts',
    [date, date],
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

// 달력 점 표시용 — 체류 기록이 있는 날(중복 없음). 점은 stay 기준이라 이동만 한 날은 빠진다.
// 자정 넘긴 체류(23:30~01:00)는 start_ts만 보면 다음날 점이 빠지므로 start~end 전 날짜를 찍는다
export async function getDatesWithData(): Promise<string[]> {
  let rows: { start_ts: string; end_ts: string }[];
  if (!isNative) {
    rows = webStays.filter((s) => !s.deleted);
  } else {
    const db = await getDb();
    const res = await db.query('SELECT start_ts, end_ts FROM stays WHERE deleted = 0');
    rows = (res.values ?? []) as { start_ts: string; end_ts: string }[];
  }
  const days = new Set<string>();
  for (const r of rows) {
    const last = r.end_ts.slice(0, 10);
    for (let d = r.start_ts.slice(0, 10); d <= last; d = addDaysStr(d, 1)) days.add(d);
  }
  return [...days];
}

// 장소별 방문 달력용 — [fromTs, toTs) 안에서 이 라벨을 방문한 날(중복 없음).
// 자정 넘긴 체류는 걸친 날 모두 찍되(getDatesWithData와 동일) 요청한 달 밖 날은 뺀다
export async function getVisitDaysByLabel(
  label: string,
  fromTs: string,
  toTs: string,
): Promise<string[]> {
  const fromDay = fromTs.slice(0, 10);
  const toDay = toTs.slice(0, 10); // 배타 — 다음 달 1일
  const days = new Set<string>();
  for (const s of await getStaysByRange(fromTs, toTs)) {
    if (s.label !== label) continue;
    const last = s.end_ts.slice(0, 10);
    for (let d = s.start_ts.slice(0, 10); d <= last; d = addDaysStr(d, 1)) {
      if (d >= fromDay && d < toDay) days.add(d);
    }
  }
  return [...days];
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

// 라벨된(삭제 안 된) stay만 — 라벨 근접 조회의 스캔 대상을 좁힌다.
// 새 stay 확정마다 findNearestLabel이 불려 전체(19개월치)를 훑던 것을 라벨된 것만으로 줄인다
async function getLabeledStays(): Promise<Stay[]> {
  if (!isNative) return webStays.filter((s) => !s.deleted && s.label !== null);
  const db = await getDb();
  const res = await db.query(
    'SELECT * FROM stays WHERE deleted = 0 AND label IS NOT NULL ORDER BY start_ts',
  );
  return (res.values ?? []) as Stay[];
}

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
  for (const s of await getLabeledStays()) {
    const dist = haversineM(lat, lng, s.lat, s.lng);
    if (dist <= labelRadiusM && (!best || dist < best.dist)) best = { label: s.label!, dist };
  }
  return best?.label ?? null;
}

// 라벨별 대표 좌표(평균) — stay마다 중심점이 산포해 같은 장소가 지도에 여러 곳으로 찍히는 것을 표시 단계에서 스냅
export async function getLabelCoords(): Promise<Record<string, { lat: number; lng: number }>> {
  if (!isNative) {
    const acc: Record<string, { lat: number; lng: number; n: number }> = {};
    for (const s of webStays) {
      if (s.deleted || s.label === null) continue;
      const a = (acc[s.label] ??= { lat: 0, lng: 0, n: 0 });
      a.lat += s.lat;
      a.lng += s.lng;
      a.n++;
    }
    return Object.fromEntries(
      Object.entries(acc).map(([k, v]) => [k, { lat: v.lat / v.n, lng: v.lng / v.n }]),
    );
  }
  const db = await getDb();
  const res = await db.query(
    'SELECT label, AVG(lat) AS lat, AVG(lng) AS lng FROM stays WHERE deleted = 0 AND label IS NOT NULL GROUP BY label',
  );
  return Object.fromEntries(
    ((res.values ?? []) as { label: string; lat: number; lng: number }[]).map((r) => [
      r.label,
      { lat: r.lat, lng: r.lng },
    ]),
  );
}

export async function getNearbyLabels(lat: number, lng: number): Promise<string[]> {
  const labels = (await getLabeledStays())
    .filter((s) => haversineM(lat, lng, s.lat, s.lng) <= labelRadiusM)
    .map((s) => s.label!);
  return [...new Set(labels)];
}

// 입력 중 자동완성용 — 근처(getNearbyLabels)와 달리 좌표 무관 전체 라벨
export async function getAllLabels(): Promise<string[]> {
  if (!isNative) {
    return [...new Set(webStays.filter((s) => !s.deleted && s.label !== null).map((s) => s.label!))];
  }
  const db = await getDb();
  const res = await db.query(
    'SELECT DISTINCT label FROM stays WHERE deleted = 0 AND label IS NOT NULL ORDER BY label',
  );
  return ((res.values ?? []) as { label: string }[]).map((r) => r.label);
}

// 겹침 판정용 — 저장하려는 이름을 이미 다른 체류가 쓰고 있으면 합쳐진다고 알린다
export async function countStaysByLabel(label: string): Promise<number> {
  if (!isNative) return webStays.filter((s) => !s.deleted && s.label === label).length;
  const db = await getDb();
  const res = await db.query('SELECT COUNT(*) AS n FROM stays WHERE deleted = 0 AND label = ?', [
    label,
  ]);
  return (res.values?.[0]?.n ?? 0) as number;
}

// 이름 기준 통일 — 좌표와 무관하게 같은 이름을 쓰던 체류를 한꺼번에 바꾼다
export async function relabelByName(oldLabel: string, newLabel: string): Promise<void> {
  if (!isNative) {
    for (const s of webStays) if (!s.deleted && s.label === oldLabel) s.label = newLabel;
    return;
  }
  const db = await getDb();
  await db.run('UPDATE stays SET label = ? WHERE deleted = 0 AND label = ?', [newLabel, oldLabel]);
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

// label 바인드 1개 + id N개 ≤ 999(SQLite 변수 한도)라 넉넉히 500씩 끊는다
const RELABEL_CHUNK = 500;

export async function relabelNearbyUnlabeled(lat: number, lng: number, label: string): Promise<void> {
  const targets = (await getAllStays()).filter(
    (s) => s.label === null && haversineM(lat, lng, s.lat, s.lng) <= labelRadiusM,
  );
  if (!isNative) {
    for (const t of targets) await updateStayLabel(t.id, label);
    return;
  }
  if (targets.length === 0) return;
  const db = await getDb();
  // 대상 id를 모아 한 번의 UPDATE로 — 대상마다 브릿지를 왕복하면 19개월치일 때 1~2초 걸린다
  const ids = targets.map((t) => t.id);
  for (let i = 0; i < ids.length; i += RELABEL_CHUNK) {
    const chunk = ids.slice(i, i + RELABEL_CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    await db.run(`UPDATE stays SET label = ? WHERE id IN (${placeholders})`, [label, ...chunk]);
  }
}
