import { useQuery } from '@tanstack/react-query';
import { getCollectorPointsAfter, getPointsByDate } from '../../db/points';
import type { Point } from '../../db/points';
import { getLastCollectorStayEnd, getStaysByDate, insertStay } from '../../db/stays';
import type { Stay } from '../../db/stays';
import { detectStays } from './detectStays';
import type { StayDraft } from './detectStays';

// F2 증분 처리: 마지막 확정 stay 이후의 points만 다시 판정한다.
// 확정(클러스터를 벗어난) stay만 저장하고, 진행 중 클러스터는 반환만 한다 —
// 다음 실행 때 같은 구간을 다시 판정해도 결과가 같아 멱등이다.
async function recomputeStays(): Promise<StayDraft | null> {
  const cursor = await getLastCollectorStayEnd();
  const points = await getCollectorPointsAfter(cursor);
  const { finalized, ongoing } = detectStays(points);
  for (const s of finalized) {
    await insertStay({
      start_ts: s.startTs,
      end_ts: s.endTs,
      lat: s.lat,
      lng: s.lng,
      label: null,
      source: 'collector',
    });
  }
  return ongoing;
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
