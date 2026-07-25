import type { NewPoint, Point } from '../../db/points';
import type { NewStay, Stay } from '../../db/stays';

// 백업 복원은 deleted까지 되살려야 한다 — 빠지면 증분 커서가 뒤로 밀려 지운 체류가 재판정으로 부활한다
export type BackupStay = NewStay & { deleted: number };

export interface Backup {
  app: 'location-tracker';
  schemaVersion: 1;
  exportedAt: string;
  points: NewPoint[];
  stays: BackupStay[];
}

export function buildBackup(points: Point[], stays: Stay[], exportedAt: string): Backup {
  return {
    app: 'location-tracker',
    schemaVersion: 1,
    points: points.map(({ ts, lat, lng, accuracy_m, source }) => ({
      ts,
      lat,
      lng,
      accuracy_m,
      source,
    })),
    stays: stays.map(({ start_ts, end_ts, lat, lng, label, source, deleted }) => ({
      start_ts,
      end_ts,
      lat,
      lng,
      label,
      source,
      deleted,
    })),
    exportedAt,
  };
}

// 백업 파일 판별 — 아니면 null을 돌려 구글 타임라인 파싱으로 넘긴다
export function parseBackup(json: unknown): Backup | null {
  const b = json as Backup;
  if (b?.app !== 'location-tracker' || b.schemaVersion !== 1) return null;
  if (!Array.isArray(b.points) || !Array.isArray(b.stays)) return null;
  return b;
}
