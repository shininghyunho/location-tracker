import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup } from './backup';
import type { Point } from '../../db/points';
import type { Stay } from '../../db/stays';

const point: Point = {
  id: 7,
  ts: '2026-07-01T09:00:00.000+09:00',
  lat: 37.5,
  lng: 127.0,
  accuracy_m: 12,
  source: 'collector',
};

const stay: Stay = {
  id: 3,
  start_ts: '2026-07-01T09:00:00.000+09:00',
  end_ts: '2026-07-01T11:00:00.000+09:00',
  lat: 37.5,
  lng: 127.0,
  label: '집',
  source: 'collector',
  deleted: 1,
};

describe('buildBackup', () => {
  it('DB의 id는 빼고 deleted는 남긴다 — 복원 시 id는 새로 발급, deleted는 커서 보존에 필요', () => {
    const b = buildBackup([point], [stay], '2026-07-25T03:00:00.000Z');
    expect(b.points[0]).toEqual({
      ts: point.ts,
      lat: point.lat,
      lng: point.lng,
      accuracy_m: point.accuracy_m,
      source: point.source,
    });
    expect(b.stays[0].deleted).toBe(1);
    expect('id' in b.stays[0]).toBe(false);
  });
});

describe('parseBackup', () => {
  it('buildBackup 산출물을 그대로 되읽는다 (왕복)', () => {
    const b = buildBackup([point], [stay], '2026-07-25T03:00:00.000Z');
    expect(parseBackup(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('구글 타임라인 등 백업이 아닌 JSON은 null — 타임라인 파싱으로 넘어가야 한다', () => {
    expect(parseBackup({ semanticSegments: [] })).toBeNull();
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup({ app: 'location-tracker', schemaVersion: 2 })).toBeNull();
    expect(parseBackup({ app: 'location-tracker', schemaVersion: 1, points: [] })).toBeNull();
  });
});
