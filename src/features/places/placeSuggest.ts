// 카카오 카테고리 검색 응답 중 추천에 쓰는 필드만
export interface KakaoPlaceDoc {
  id: string;
  place_name: string;
  distance: string;
  category_name: string;
}

export interface PlaceSuggestion {
  name: string;
  distanceM: number;
  category: string;
}

export function mergeSuggestions(batches: KakaoPlaceDoc[][], limit = 5): PlaceSuggestion[] {
  const seen = new Set<string>();
  const all: PlaceSuggestion[] = [];
  for (const doc of batches.flat()) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    all.push({
      name: doc.place_name,
      distanceM: Number(doc.distance),
      category: doc.category_name.split(' > ').at(-1) ?? '',
    });
  }
  return all.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

// 무료 쿼터(일 10만) 대비 극소량 — 버그로 루프가 돌아도 쿼터 근처에 못 가게 하는 자체 상한
export const DAILY_CALL_LIMIT = 40;

export interface QuotaState {
  date: string;
  used: number;
  // 429·401 응답을 받은 날은 재시도해도 소용없으니 하루 잠근다
  blocked: boolean;
}

export function normalizeQuota(state: QuotaState | null, today: string): QuotaState {
  if (state === null || state.date !== today) return { date: today, used: 0, blocked: false };
  return state;
}

export function canCall(state: QuotaState, calls: number, limit = DAILY_CALL_LIMIT): boolean {
  return !state.blocked && state.used + calls <= limit;
}
