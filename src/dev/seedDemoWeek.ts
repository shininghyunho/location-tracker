import { insertPoint } from '../db/points';
import { insertStay } from '../db/stays';

// README 캡처 전용 데모 데이터(웹 ?demo) — 라벨 붙은 일주일치 + 오늘 하루 동선.
// 실제 수집 위치와 무관한 서울 시내 임의 좌표만 쓴다.
const HOME = { lat: 37.5561, lng: 126.9059 }; // 마포 임의
const OFFICE = { lat: 37.5006, lng: 127.0364 }; // 강남 임의
const CAFE = { lat: 37.5446, lng: 127.0565 }; // 성수 임의
const PARK = { lat: 37.5285, lng: 126.9327 }; // 여의도 임의
const LUNCH = { lat: 37.5013, lng: 127.0396 }; // 회사 근처, 반경 100m 밖이라 별개 장소

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function iso(date: string, min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}:00.000+09:00`;
}

interface Seg {
  fromMin: number;
  count: number; // 1분 간격 point 수
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

// 오늘 시나리오: 집 → 회사 → 점심(라벨 없음) → 회사 → 집
const TODAY_SEGS: Seg[] = [
  { fromMin: 7 * 60 + 20, count: 76, from: HOME, to: HOME },
  { fromMin: 8 * 60 + 36, count: 39, from: HOME, to: OFFICE },
  { fromMin: 9 * 60 + 15, count: 171, from: OFFICE, to: OFFICE },
  { fromMin: 12 * 60 + 6, count: 9, from: OFFICE, to: LUNCH },
  { fromMin: 12 * 60 + 15, count: 51, from: LUNCH, to: LUNCH },
  { fromMin: 13 * 60 + 6, count: 9, from: LUNCH, to: OFFICE },
  { fromMin: 13 * 60 + 15, count: 316, from: OFFICE, to: OFFICE },
  { fromMin: 18 * 60 + 31, count: 39, from: OFFICE, to: HOME },
  { fromMin: 19 * 60 + 10, count: 141, from: HOME, to: HOME },
];

export async function seedDemoWeek(): Promise<void> {
  const now = new Date();
  const today = dateStr(now);

  // 지난 12일: stay를 직접 넣는다 — 달력 점·통계·라벨 자동 상속의 원천.
  // 두 주에 걸쳐야 통계에서 이전 기간으로 넘겨도 화면이 채워져 보인다
  for (let back = 12; back >= 1; back--) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    const date = dateStr(d);
    const dow = d.getDay();
    const jig = (back * 7) % 20; // 날마다 시간이 조금씩 달라야 통계 화면이 자연스럽다
    if (dow === 0 || dow === 6) {
      await insertStay({ start_ts: iso(date, 9 * 60 + jig), end_ts: iso(date, 11 * 60 + 30), ...HOME, label: '집', source: 'collector' });
      await insertStay({ start_ts: iso(date, 14 * 60), end_ts: iso(date, 16 * 60 + 40 + jig), ...PARK, label: '한강공원', source: 'collector' });
    } else {
      await insertStay({ start_ts: iso(date, 7 * 60 + jig), end_ts: iso(date, 8 * 60 + 30), ...HOME, label: '집', source: 'collector' });
      await insertStay({ start_ts: iso(date, 9 * 60 + 10), end_ts: iso(date, 18 * 60 + 40 - jig), ...OFFICE, label: '회사', source: 'collector' });
      await insertStay({ start_ts: iso(date, 19 * 60 + 5), end_ts: iso(date, 20 * 60 + 15 + jig), ...CAFE, label: '카페', source: 'collector' });
    }
  }

  // 오늘은 point만 — 체류 판정이 실제처럼 카드·지도 경로를 만든다.
  // 현재 시각 이후는 버려서 마지막 클러스터가 '진행 중'으로 남는다.
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const [segIdx, seg] of TODAY_SEGS.entries()) {
    for (let i = 0; i < seg.count; i++) {
      const min = seg.fromMin + i;
      if (min > nowMin) return;
      const t = seg.count === 1 ? 0 : i / (seg.count - 1);
      const jitter = 0.00005 * Math.sin(i * 7 + segIdx); // 반경 ~6m GPS 오차 흉내
      await insertPoint({
        ts: iso(today, min),
        lat: seg.from.lat + (seg.to.lat - seg.from.lat) * t + jitter,
        lng: seg.from.lng + (seg.to.lng - seg.from.lng) * t + jitter,
        accuracy_m: 5,
        source: 'collector',
      });
    }
  }
}
