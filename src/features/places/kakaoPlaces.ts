import { CapacitorHttp } from '@capacitor/core';
import { todayStr } from '../../lib/date';
import type { KakaoPlaceDoc, PlaceSuggestion, QuotaState } from './placeSuggest';
import { canCall, mergeSuggestions, normalizeQuota } from './placeSuggest';

const KEY = import.meta.env.VITE_KAKAO_REST_KEY as string | undefined;
export const hasKakaoKey = Boolean(KEY);

// 체류가 잦은 카테고리만 최소로 — 탭 1회 = 4콜을 넘기지 않는다
const CATEGORY_CODES = ['FD6', 'CE7', 'CS2', 'HP8'];
const RADIUS_M = 100;

const QUOTA_KEY = 'kakaoSuggestQuota';

function loadQuota(): QuotaState {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    return normalizeQuota(raw ? (JSON.parse(raw) as QuotaState) : null, todayStr());
  } catch {
    return normalizeQuota(null, todayStr());
  }
}

function saveQuota(state: QuotaState) {
  localStorage.setItem(QUOTA_KEY, JSON.stringify(state));
}

export type SuggestResult =
  | { ok: true; places: PlaceSuggestion[] }
  | { ok: false; reason: 'quota' | 'auth' | 'network' };

export async function fetchNearbyPlaces(lat: number, lng: number): Promise<SuggestResult> {
  if (!KEY) return { ok: false, reason: 'auth' };

  let quota = loadQuota();
  if (!canCall(quota, CATEGORY_CODES.length)) return { ok: false, reason: 'quota' };
  quota = { ...quota, used: quota.used + CATEGORY_CODES.length };
  saveQuota(quota);

  const results = await Promise.allSettled(
    CATEGORY_CODES.map((code) =>
      CapacitorHttp.get({
        url: 'https://dapi.kakao.com/v2/local/search/category.json',
        headers: { Authorization: `KakaoAK ${KEY}` },
        params: {
          category_group_code: code,
          x: String(lng),
          y: String(lat),
          radius: String(RADIUS_M),
          sort: 'distance',
          size: '3',
        },
      }),
    ),
  );

  const batches: KakaoPlaceDoc[][] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { status, data } = r.value;
    if (status === 429 || status === 401 || status === 403) {
      saveQuota({ ...quota, blocked: true });
      return { ok: false, reason: status === 429 ? 'quota' : 'auth' };
    }
    if (status === 200 && Array.isArray(data?.documents)) batches.push(data.documents);
  }
  // 8콜 전부 네트워크 실패면 결과가 아니라 오류로 알린다
  if (batches.length === 0) return { ok: false, reason: 'network' };
  return { ok: true, places: mergeSuggestions(batches) };
}
