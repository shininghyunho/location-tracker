import type { Point } from '../../db/points';
import { haversineM } from '../stays/detectStays';

// 이동 중 오래된 캐시 위치(stale 픽스)가 최신 픽스처럼 끼어들어 궤적이 역주행 지그재그를 그린다.
// stale 픽스 = 방금 지나온 위치의 메아리 — 그 정의로 거른다:
// 직전 유지점에서 jumpM 이상 튀었는데, 그 위치가 minAge~maxAge 전 지나온 유지점 반경 echoM 안이면 제외.
// 체류(제자리)는 직전 점과 가까워 jumpM에 안 걸리고, 같은 길 재방문은 maxAge 밖이라 안전.
export interface EchoParams {
  echoM: number;
  jumpM: number;
  minAgeMs: number;
  maxAgeMs: number;
}

export const DEFAULT_ECHO_PARAMS: EchoParams = {
  echoM: 50,
  jumpM: 50,
  minAgeMs: 90_000,
  maxAgeMs: 10 * 60_000,
};

export function dropStaleEchoes(points: Point[], params: EchoParams = DEFAULT_ECHO_PARAMS): Point[] {
  const kept: Point[] = [];
  for (const p of points) {
    const prev = kept.at(-1);
    if (prev && haversineM(prev.lat, prev.lng, p.lat, p.lng) > params.jumpM) {
      const t = Date.parse(p.ts);
      const isEcho = kept.some((k) => {
        const age = t - Date.parse(k.ts);
        return (
          age >= params.minAgeMs &&
          age <= params.maxAgeMs &&
          haversineM(k.lat, k.lng, p.lat, p.lng) <= params.echoM
        );
      });
      if (isEcho) continue;
    }
    kept.push(p);
  }
  return kept;
}
