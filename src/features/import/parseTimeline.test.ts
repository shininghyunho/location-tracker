import { describe, expect, it } from 'vitest';
import { parseLatLng, parseTimeline, toKstIso } from './parseTimeline';

describe('parseLatLng — 구글 좌표 문자열 파싱', () => {
  it('도 기호 붙은 "lat°, lng°" 형식을 [lat, lng]로 파싱한다', () => {
    expect(parseLatLng('37.4058816°, 126.6787599°')).toEqual([37.4058816, 126.6787599]);
  });

  it('빈 파트("37.40,")는 Number("")=0으로 통과하지 못하게 null', () => {
    expect(parseLatLng('37.40,')).toBeNull();
  });

  it('숫자가 아니면 null', () => {
    expect(parseLatLng('abc, 126.67')).toBeNull();
  });

  it('위경도 범위를 벗어나면 null', () => {
    expect(parseLatLng('91, 126.67')).toBeNull();
    expect(parseLatLng('37.40, 181')).toBeNull();
  });

  it('파트가 2개가 아니면 null', () => {
    expect(parseLatLng('37.40')).toBeNull();
    expect(parseLatLng('37.40, 126.67, 5')).toBeNull();
  });
});

describe('toKstIso — 시각을 +09:00 표기로 통일', () => {
  it('Z(UTC) 표기를 KST로 변환한다', () => {
    expect(toKstIso('2026-07-24T15:00:00Z')).toBe('2026-07-25T00:00:00.000+09:00');
  });

  it('이미 +09:00인 시각은 같은 순간을 유지한다', () => {
    expect(toKstIso('2026-07-25T09:30:00.123+09:00')).toBe('2026-07-25T09:30:00.123+09:00');
  });

  it('다른 오프셋(+02:00)도 KST 순간으로 환산한다', () => {
    expect(toKstIso('2026-07-25T02:00:00+02:00')).toBe('2026-07-25T09:00:00.000+09:00');
  });

  it('파싱 불가 문자열은 null', () => {
    expect(toKstIso('not-a-date')).toBeNull();
  });
});

describe('parseTimeline — visit→stay, path·rawSignals→point 매핑', () => {
  it('visit을 stay로, timelinePath·rawSignals를 point로 매핑한다', () => {
    const { stays, points } = parseTimeline({
      semanticSegments: [
        {
          startTime: '2026-07-24T15:00:00Z',
          endTime: '2026-07-24T16:00:00Z',
          visit: { topCandidate: { placeLocation: { latLng: '37.4048°, 126.6789°' } } },
          timelinePath: [{ point: '37.4050°, 126.6790°', time: '2026-07-24T15:30:00Z' }],
        },
      ],
      rawSignals: [
        {
          position: {
            LatLng: '37.4052°, 126.6791°',
            accuracyMeters: 12,
            timestamp: '2026-07-24T15:40:00Z',
          },
        },
      ],
    });
    expect(stays).toEqual([
      {
        start_ts: '2026-07-25T00:00:00.000+09:00',
        end_ts: '2026-07-25T01:00:00.000+09:00',
        lat: 37.4048,
        lng: 126.6789,
        label: null,
        source: 'import',
      },
    ]);
    expect(points).toEqual([
      {
        ts: '2026-07-25T00:30:00.000+09:00',
        lat: 37.405,
        lng: 126.679,
        accuracy_m: null,
        source: 'import',
      },
      {
        ts: '2026-07-25T00:40:00.000+09:00',
        lat: 37.4052,
        lng: 126.6791,
        accuracy_m: 12,
        source: 'import',
      },
    ]);
  });

  it('좌표나 시각이 깨진 항목은 건너뛴다', () => {
    const { stays, points } = parseTimeline({
      semanticSegments: [
        {
          startTime: '2026-07-24T15:00:00Z',
          endTime: '2026-07-24T16:00:00Z',
          visit: { topCandidate: { placeLocation: { latLng: '91°, 126.6789°' } } },
          timelinePath: [{ point: '37.4050°, 126.6790°', time: 'broken' }],
        },
      ],
      rawSignals: [{ position: { LatLng: '37.4052°, 126.6791°' } }],
    });
    expect(stays).toEqual([]);
    expect(points).toEqual([]);
  });

  it('빈 파일이면 빈 결과', () => {
    expect(parseTimeline({})).toEqual({ stays: [], points: [] });
  });
});
