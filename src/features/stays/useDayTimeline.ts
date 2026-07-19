import { useQuery } from '@tanstack/react-query';
import { getCollectorPointsAfter, getPointsByDate } from '../../db/points';
import type { Point } from '../../db/points';
import {
  findNearestLabel,
  getLastCollectorStay,
  getStaysByDate,
  insertStay,
  updateStayEnd,
} from '../../db/stays';
import type { Stay } from '../../db/stays';
import { DEFAULT_STAY_PARAMS, detectStays, haversineM } from './detectStays';
import type { StayDraft } from './detectStays';

// 정지 중 수집 블랙아웃 이어붙이기 판정: 새 클러스터가 직전 체류와 같은 장소이고
// 공백이 한도 이내면 "계속 머문 것"이다. 그동안 이동했다면 모션 감지로 점이 남았을 것.
function continuesStay(prev: Stay, next: StayDraft): boolean {
  const samePlace = haversineM(prev.lat, prev.lng, next.lat, next.lng) <= DEFAULT_STAY_PARAMS.radiusM;
  const gap = Date.parse(next.startTs) - Date.parse(prev.end_ts);
  return samePlace && gap >= 0 && gap <= DEFAULT_STAY_PARAMS.bridgeMaxGapMs;
}

// F2 증분 처리: 마지막 확정 stay 이후의 points만 다시 판정한다.
// 확정(클러스터를 벗어난) stay만 저장하고, 진행 중 클러스터는 반환만 한다 —
// 다음 실행 때 같은 구간을 다시 판정해도 결과가 같아 멱등이다.
export async function recomputeStays(): Promise<StayDraft | null> {
  const lastStay = await getLastCollectorStay();
  const points = await getCollectorPointsAfter(lastStay?.end_ts ?? null);
  const { finalized, ongoing } = detectStays(points);

  // 블랙아웃 이어붙이기: 시간상 첫 새 클러스터가 직전 저장 체류와 같은 장소면(정지 공백)
  // 별도 체류를 만들지 않고 그 체류의 끝을 늘린다. 지운 체류엔 잇지 않는다.
  const first = finalized[0] ?? ongoing;
  const bridged = lastStay != null && !lastStay.deleted && first != null && continuesStay(lastStay, first);
  if (bridged) await updateStayEnd(lastStay!.id, first!.endTs);

  // 이어붙인 클러스터가 확정분이었다면 그 하나만 건너뛰고 나머지를 저장한다
  const toInsert = bridged && finalized.length > 0 ? finalized.slice(1) : finalized;
  for (const s of toInsert) {
    await insertStay({
      start_ts: s.startTs,
      end_ts: s.endTs,
      lat: s.lat,
      lng: s.lng,
      label: await findNearestLabel(s.lat, s.lng),
      source: 'collector',
    });
  }

  // 진행중 클러스터를 저장 체류로 흡수했으면 따로 보고하지 않는다(중복 표시 방지)
  return bridged && finalized.length === 0 ? null : ongoing;
}

export interface DayTimeline {
  stays: Stay[];
  points: Point[];
  ongoing: StayDraft | null;
}

export function useDayTimeline(date: string) {
  return useQuery<DayTimeline>({
    queryKey: ['timeline', date],
    queryFn: async () => {
      const ongoing = await recomputeStays();
      const [stays, points] = await Promise.all([getStaysByDate(date), getPointsByDate(date)]);
      return { stays, points, ongoing };
    },
    refetchInterval: 30_000,
  });
}
