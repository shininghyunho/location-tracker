import { describe, expect, it } from 'vitest';
import { collapseStayWindows, type StayWindow } from './collapseStayWindows';
import type { Point } from '../../db/points';

const SNAP = { lat: 37.4048, lng: 126.6789 };

let seq = 0;
function pt(ts: string, lat: number, lng: number): Point {
  return { id: ++seq, ts, lat, lng, accuracy_m: 10, source: 'collector' };
}

function win(startTs: string, endTs: string, snap = SNAP): StayWindow {
  return { startTs, endTs, ...snap };
}

describe('collapseStayWindows — 체류 창 안 지터를 대표 좌표 한 점으로 접기', () => {
  it('창 안 점들을 전부 빼고 창 시작 자리에 스냅 좌표 한 점을 넣는다', () => {
    const before = pt('2026-07-13T09:50:00+09:00', 37.40, 126.67);
    const inside1 = pt('2026-07-13T10:10:00+09:00', 37.4051, 126.6785);
    const inside2 = pt('2026-07-13T10:40:00+09:00', 37.4045, 126.6792);
    const after = pt('2026-07-13T11:10:00+09:00', 37.41, 126.68);
    const w = win('2026-07-13T10:00:00+09:00', '2026-07-13T11:00:00+09:00');

    const track = collapseStayWindows([before, inside1, inside2, after], [w]);
    expect(track).toEqual([
      { lat: before.lat, lng: before.lng },
      { lat: SNAP.lat, lng: SNAP.lng },
      { lat: after.lat, lng: after.lng },
    ]);
  });

  it('창이 여럿이면 각 창마다 스냅 점이 시간 순서 자리에 들어간다', () => {
    const move = pt('2026-07-13T12:30:00+09:00', 37.45, 126.80);
    const w1 = win('2026-07-13T10:00:00+09:00', '2026-07-13T12:00:00+09:00');
    const w2 = win('2026-07-13T13:00:00+09:00', '2026-07-13T15:00:00+09:00', { lat: 37.5, lng: 126.9 });

    const track = collapseStayWindows([move], [w1, w2]);
    expect(track).toEqual([
      { lat: SNAP.lat, lng: SNAP.lng },
      { lat: move.lat, lng: move.lng },
      { lat: 37.5, lng: 126.9 },
    ]);
  });

  it('창이 없으면 원본 좌표를 순서 그대로 유지한다', () => {
    const pts = [
      pt('2026-07-13T09:00:00+09:00', 37.40, 126.67),
      pt('2026-07-13T09:10:00+09:00', 37.41, 126.68),
    ];
    const track = collapseStayWindows(pts, []);
    expect(track).toEqual(pts.map(({ lat, lng }) => ({ lat, lng })));
  });
});
