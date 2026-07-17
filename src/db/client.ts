import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'tracker';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy_m REAL,
  source TEXT NOT NULL CHECK (source IN ('collector', 'import'))
);
CREATE INDEX IF NOT EXISTS idx_points_ts ON points (ts);

-- 수집 엔진이 같은 GPS 픽스를 레코드 2개로 줄 때가 있어 (ts, source)를 유일하게 유지한다.
-- 유니크 인덱스 생성 전에 기존 중복부터 정리해야 해서 DELETE가 먼저다.
DELETE FROM points WHERE id NOT IN (SELECT MIN(id) FROM points GROUP BY ts, source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ts_source ON points (ts, source);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  tag TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs (ts);

-- 로그가 무한히 쌓이지 않도록 앱 시작 시 최근 2000건만 남긴다
DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 2000);

CREATE TABLE IF NOT EXISTS stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_ts TEXT NOT NULL,
  end_ts TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  label TEXT,
  source TEXT NOT NULL CHECK (source IN ('collector', 'import')),
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stays_start_ts ON stays (start_ts);

-- 재-import 멱등성(F6): 같은 시각·같은 source의 stay는 하나만. 인덱스 생성 전에 기존 중복부터 정리한다.
DELETE FROM stays WHERE id NOT IN (SELECT MIN(id) FROM stays GROUP BY start_ts, source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stays_start_source ON stays (start_ts, source);
`;

const sqlite = new SQLiteConnection(CapacitorSQLite);
let dbPromise: Promise<SQLiteDBConnection> | null = null;

export function getDb(): Promise<SQLiteDBConnection> {
  dbPromise ??= (async () => {
    const db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await db.open();
    await db.execute(SCHEMA);
    // 기존 설치 DB 마이그레이션 — 컬럼이 이미 있으면 에러가 나므로 무시한다
    await db.execute('ALTER TABLE stays ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0').catch(() => {});
    return db;
  })();
  return dbPromise;
}
