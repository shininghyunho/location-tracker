import type { NewPoint } from '../../db/points';
import type { NewStay } from '../../db/stays';

// 실측 스키마(PRD §6-1) 중 읽는 필드만 선언 — 나머지 키는 무시된다
interface TimelineFile {
  semanticSegments?: {
    startTime?: string;
    endTime?: string;
    visit?: { topCandidate?: { placeLocation?: { latLng?: string } } };
    timelinePath?: { point?: string; time?: string }[];
  }[];
  rawSignals?: {
    position?: { LatLng?: string; accuracyMeters?: number; timestamp?: string };
  }[];
}

export interface ParsedTimeline {
  stays: NewStay[];
  points: NewPoint[];
}

// "37.4058816°, 126.6787599°" → [lat, lng]. 형식이 다르면 null
function parseLatLng(raw: string): [number, number] | null {
  const parts = raw.split(',').map((p) => Number(p.replace('°', '').trim()));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  return [parts[0], parts[1]];
}

// PRD §6-2 매핑: visit→stay, timelinePath·rawSignals.position→point. 깨진 항목은 건너뛴다
export function parseTimeline(raw: unknown): ParsedTimeline {
  const file = raw as TimelineFile;
  const stays: NewStay[] = [];
  const points: NewPoint[] = [];

  for (const seg of file.semanticSegments ?? []) {
    if (seg.visit) {
      const latLng = seg.visit.topCandidate?.placeLocation?.latLng;
      const coords = latLng ? parseLatLng(latLng) : null;
      if (coords && seg.startTime && seg.endTime) {
        stays.push({
          start_ts: seg.startTime,
          end_ts: seg.endTime,
          lat: coords[0],
          lng: coords[1],
          label: null,
          source: 'import',
        });
      }
    }
    for (const p of seg.timelinePath ?? []) {
      const coords = p.point ? parseLatLng(p.point) : null;
      if (coords && p.time) {
        points.push({ ts: p.time, lat: coords[0], lng: coords[1], accuracy_m: null, source: 'import' });
      }
    }
  }

  for (const sig of file.rawSignals ?? []) {
    const pos = sig.position;
    const coords = pos?.LatLng ? parseLatLng(pos.LatLng) : null;
    if (coords && pos?.timestamp) {
      points.push({
        ts: pos.timestamp,
        lat: coords[0],
        lng: coords[1],
        accuracy_m: pos.accuracyMeters ?? null,
        source: 'import',
      });
    }
  }

  return { stays, points };
}
