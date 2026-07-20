import { describe, expect, it } from 'vitest';
import { dropStaleEchoes } from './dropStaleEchoes';
import type { Point } from '../../db/points';

// 위도 1도 ≈ 111.32km — 미터 단위 북쪽 오프셋으로 경로를 만든다
const BASE = { lat: 37.4048, lng: 126.6789 };
function at(northM: number): { lat: number; lng: number } {
  return { lat: BASE.lat + northM / 111_320, lng: BASE.lng };
}

const T0 = Date.parse('2026-07-13T10:00:00+09:00');

let seq = 0;
function pt(offsetSec: number, northM: number): Point {
  return {
    id: ++seq,
    ts: new Date(T0 + offsetSec * 1000).toISOString(),
    ...at(northM),
    accuracy_m: 10,
    source: 'collector',
  };
}

describe('dropStaleEchoes — 이동 중 stale 픽스 제거', () => {
  it('지나온 위치로 되돌아간 메아리 점(90초~10분 전 반경 안)을 버린다', () => {
    const walk = [pt(0, 0), pt(60, 200), pt(120, 400)];
    const echo = pt(180, 10); // 3분 전 출발점 근처로 400m 역주행
    const next = pt(240, 600);
    const kept = dropStaleEchoes([...walk, echo, next]);
    expect(kept).toEqual([...walk, next]);
  });

  it('연속 메아리도 전부 버린다 — 비교 기준이 유지점이라 두 번째도 잡힌다', () => {
    const walk = [pt(0, 0), pt(60, 200), pt(120, 400)];
    const echoes = [pt(180, 10), pt(200, 20)];
    const kept = dropStaleEchoes([...walk, ...echoes]);
    expect(kept).toEqual(walk);
  });

  it('체류 제자리 지터(점프 한도 이하)는 건드리지 않는다', () => {
    const jitter = [pt(0, 0), pt(60, 30), pt(120, 5), pt(180, 40)];
    expect(dropStaleEchoes(jitter)).toEqual(jitter);
  });

  it('한참 뒤(10분 초과) 같은 길 재방문은 메아리가 아니다', () => {
    const walk = [pt(0, 0), pt(60, 200), pt(120, 400)];
    const revisit = pt(120 + 11 * 60, 10);
    const kept = dropStaleEchoes([...walk, revisit]);
    expect(kept).toEqual([...walk, revisit]);
  });

  it('직후(90초 미만) 점은 메아리로 오폭하지 않는다', () => {
    const start = pt(0, 0);
    const quickMove = pt(30, 200);
    const back = pt(60, 10); // 출발점 1분 뒤 — minAge 미달
    const kept = dropStaleEchoes([start, quickMove, back]);
    expect(kept).toEqual([start, quickMove, back]);
  });
});
