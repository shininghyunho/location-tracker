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
`;

const sqlite = new SQLiteConnection(CapacitorSQLite);
let dbPromise: Promise<SQLiteDBConnection> | null = null;

export function getDb(): Promise<SQLiteDBConnection> {
  dbPromise ??= (async () => {
    const db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await db.open();
    await db.execute(SCHEMA);
    return db;
  })();
  return dbPromise;
}
