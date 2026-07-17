import { insertPoint } from '../db/points';

// 웹(npm run dev) 전용 가짜 하루 시나리오 — 체류지 판정·화면 검증용.
// 실제 수집 위치와 무관한 서울 시내 임의 좌표만 쓴다.
const CITY_HALL = { lat: 37.5665, lng: 126.978 };
const NAMSAN = { lat: 37.5512, lng: 126.9882 };
const JUNG_GU = { lat: 37.558, lng: 126.972 };
const GWANGHWAMUN = { lat: 37.5759, lng: 126.9769 };

interface Seg {
  fromMin: number; // 09:00 기준 경과 분
  count: number; // 1분 간격 point 수
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

// 기대 결과: 시청 30분 stay + 남산 75분 stay 확정, 중구 5분 멈춤은 stay 아님,
// 광화문 40분은 마지막 클러스터라 '진행 중'
const SEGS: Seg[] = [
  { fromMin: 0, count: 31, from: CITY_HALL, to: CITY_HALL },
  { fromMin: 31, count: 14, from: CITY_HALL, to: NAMSAN },
  { fromMin: 45, count: 76, from: NAMSAN, to: NAMSAN },
  { fromMin: 121, count: 5, from: NAMSAN, to: JUNG_GU },
  { fromMin: 126, count: 6, from: JUNG_GU, to: JUNG_GU },
  { fromMin: 132, count: 8, from: JUNG_GU, to: GWANGHWAMUN },
  { fromMin: 140, count: 41, from: GWANGHWAMUN, to: GWANGHWAMUN },
];

export async function seedDevPoints(): Promise<void> {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const [segIdx, seg] of SEGS.entries()) {
    for (let i = 0; i < seg.count; i++) {
      const t = seg.count === 1 ? 0 : i / (seg.count - 1);
      const jitter = 0.00005 * Math.sin(i * 7 + segIdx); // 반경 ~6m 흔들림 (GPS 오차 흉내)
      const min = 9 * 60 + seg.fromMin + i;
      const hh = String(Math.floor(min / 60)).padStart(2, '0');
      const mm = String(min % 60).padStart(2, '0');
      await insertPoint({
        ts: `${date}T${hh}:${mm}:00.000+09:00`,
        lat: seg.from.lat + (seg.to.lat - seg.from.lat) * t + jitter,
        lng: seg.from.lng + (seg.to.lng - seg.from.lng) * t + jitter,
        accuracy_m: 5,
        source: 'collector',
      });
    }
  }
}
