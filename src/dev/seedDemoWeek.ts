import { getCollectorPointsAfter, insertPoint } from '../db/points';
import { findNearestLabel, getLastCollectorStayEnd, insertStay } from '../db/stays';
import { detectStays } from '../features/stays/detectStays';

// README 캡처 전용 데모 데이터(웹 ?demo) — 라벨 붙은 2주치 + 최근 3일 이동 궤적.
// 실제 수집 위치와 무관한 서울 시내 임의 좌표만 쓴다.
interface Pt {
  lat: number;
  lng: number;
}

const HOME: Pt = { lat: 37.5561, lng: 126.9059 }; // 마포 임의
const OFFICE: Pt = { lat: 37.5006, lng: 127.0364 }; // 강남 임의
const CAFE: Pt = { lat: 37.5446, lng: 127.0565 }; // 성수 임의
const PARK: Pt = { lat: 37.5285, lng: 126.9327 }; // 여의도 임의
const LUNCH: Pt = { lat: 37.5013, lng: 127.0396 }; // 회사 근처, 반경 100m 밖이라 별개 장소

// 이동 경유점 — 궤적이 장소 간 일직선으로 보이지 않게 꺾어준다
const YONGSAN: Pt = { lat: 37.5312, lng: 126.9644 };
const BANPO: Pt = { lat: 37.5125, lng: 127.0016 };
const JAMWON: Pt = { lat: 37.523, lng: 127.048 };
const HANNAM: Pt = { lat: 37.5275, lng: 127.009 };
const DONGJAK: Pt = { lat: 37.509, lng: 126.962 };
const MAPO_RIVER: Pt = { lat: 37.54, lng: 126.918 };

const VIAS: [Pt, Pt, Pt[]][] = [
  [HOME, OFFICE, [YONGSAN, BANPO]],
  [OFFICE, PARK, [BANPO, DONGJAK]],
  [LUNCH, CAFE, [JAMWON]],
  [CAFE, PARK, [HANNAM, YONGSAN]],
  [CAFE, HOME, [HANNAM, YONGSAN]],
  [PARK, HOME, [MAPO_RIVER]],
];

function viasBetween(a: Pt, b: Pt): Pt[] {
  for (const [x, y, via] of VIAS) {
    if (x === a && y === b) return via;
    if (x === b && y === a) return [...via].reverse();
  }
  return [];
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function iso(date: string, min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}:00.000+09:00`;
}

interface Visit {
  at: Pt;
  fromMin: number;
  toMin: number;
}

// 하루 일정(체류 목록) → 1분 간격 point 열. 체류 사이는 경유점 폴리라인을 따라 보간한다
function buildDay(visits: Visit[]): { min: number; lat: number; lng: number }[] {
  const pts: { min: number; lat: number; lng: number }[] = [];
  for (const [i, v] of visits.entries()) {
    for (let m = v.fromMin; m <= v.toMin; m++) {
      const jitter = 0.00005 * Math.sin(m * 7 + i); // 반경 ~6m GPS 오차 흉내
      pts.push({ min: m, lat: v.at.lat + jitter, lng: v.at.lng + jitter });
    }
    const next = visits[i + 1];
    if (!next) break;
    const legs = [v.at, ...viasBetween(v.at, next.at), next.at];
    const moveMins = next.fromMin - v.toMin;
    for (let m = v.toMin + 1; m < next.fromMin; m++) {
      const segT = ((m - v.toMin) / moveMins) * (legs.length - 1);
      const li = Math.min(Math.floor(segT), legs.length - 2);
      const t = segT - li;
      const a = legs[li];
      const b = legs[li + 1];
      pts.push({ min: m, lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  return pts;
}

async function seedTrack(date: string, visits: Visit[], cutMin: number | null): Promise<void> {
  for (const p of buildDay(visits)) {
    if (cutMin !== null && p.min > cutMin) return;
    await insertPoint({ ts: iso(date, p.min), lat: p.lat, lng: p.lng, accuracy_m: 5, source: 'collector' });
  }
}

const H = 60;

export async function seedDemoWeek(): Promise<void> {
  const now = new Date();

  // 12~3일 전: stay 직접 삽입 — 달력 점·통계·라벨 자동 상속의 원천.
  // 두 주에 걸쳐야 통계에서 이전 기간으로 넘겨도 화면이 채워져 보인다
  for (let back = 12; back >= 3; back--) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    const date = dateStr(d);
    const dow = d.getDay();
    const jig = (back * 7) % 20; // 날마다 시간이 조금씩 달라야 통계 화면이 자연스럽다
    if (dow === 0 || dow === 6) {
      await insertStay({ start_ts: iso(date, 9 * H + jig), end_ts: iso(date, 11 * H + 30), ...HOME, label: '집', source: 'collector' });
      await insertStay({ start_ts: iso(date, 14 * H), end_ts: iso(date, 16 * H + 40 + jig), ...PARK, label: '한강공원', source: 'collector' });
    } else {
      await insertStay({ start_ts: iso(date, 7 * H + jig), end_ts: iso(date, 8 * H + 30), ...HOME, label: '집', source: 'collector' });
      await insertStay({ start_ts: iso(date, 9 * H + 10), end_ts: iso(date, 18 * H + 40 - jig), ...OFFICE, label: '회사', source: 'collector' });
      await insertStay({ start_ts: iso(date, 19 * H + 5), end_ts: iso(date, 20 * H + 15 + jig), ...CAFE, label: '카페', source: 'collector' });
    }
  }

  // 최근 3일: point 궤적만 — 체류 판정이 실제처럼 카드·지도 경로를 만든다.
  // 과거 이틀 화면에도 이동 경로가 보이고, 라벨은 위 stay들에서 자동 상속된다
  const day = (back: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    return dateStr(d);
  };
  await seedTrack(day(2), [
    { at: HOME, fromMin: 7 * H + 15, toMin: 8 * H + 25 },
    { at: OFFICE, fromMin: 9 * H, toMin: 18 * H + 20 },
    { at: PARK, fromMin: 18 * H + 50, toMin: 20 * H },
    { at: HOME, fromMin: 20 * H + 30, toMin: 23 * H },
  ], null);
  await seedTrack(day(1), [
    { at: HOME, fromMin: 7 * H + 5, toMin: 8 * H + 15 },
    { at: OFFICE, fromMin: 8 * H + 50, toMin: 18 * H + 30 },
    { at: CAFE, fromMin: 19 * H, toMin: 20 * H + 10 },
    { at: HOME, fromMin: 20 * H + 40, toMin: 23 * H },
  ], null);
  // 오늘: 5곳을 도는 루프. 현재 시각 이후는 버려 마지막 클러스터가 '진행 중'으로 남는다
  await seedTrack(day(0), [
    { at: HOME, fromMin: 7 * H + 10, toMin: 8 * H + 20 },
    { at: OFFICE, fromMin: 8 * H + 55, toMin: 11 * H + 30 },
    { at: LUNCH, fromMin: 11 * H + 40, toMin: 12 * H + 30 },
    { at: CAFE, fromMin: 12 * H + 50, toMin: 13 * H + 50 },
    { at: PARK, fromMin: 14 * H + 20, toMin: 15 * H + 20 },
    { at: HOME, fromMin: 15 * H + 50, toMin: 23 * H },
  ], now.getHours() * H + now.getMinutes());

  // 확정 체류를 렌더 전에 미리 판정해 둔다 — 달력 점·라벨 좌표 쿼리가 첫 조회부터
  // 완전한 데이터를 보게. useDayTimeline의 증분 재판정과 커서 기준이 같아 멱등이다
  const cursor = await getLastCollectorStayEnd();
  const { finalized } = detectStays(await getCollectorPointsAfter(cursor));
  for (const s of finalized) {
    await insertStay({
      start_ts: s.startTs,
      end_ts: s.endTs,
      lat: s.lat,
      lng: s.lng,
      label: await findNearestLabel(s.lat, s.lng),
      source: 'collector',
    });
  }
}
