import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Stay } from '../../db/stays';
import {
  countStaysByLabel,
  getAllLabels,
  getNearbyLabels,
  relabelByName,
  relabelNearbyUnlabeled,
  updateStayLabel,
} from '../../db/stays';
import { appLog } from '../../lib/appLog';
import { BottomSheet } from '../../components/BottomSheet';
import { fetchNearbyPlaces, hasKakaoKey } from '../places/kakaoPlaces';
import type { SuggestResult } from '../places/kakaoPlaces';

const SUGGEST_ERROR_MSG = {
  quota: '오늘 추천 한도를 다 썼어요. 내일 다시 시도해 주세요.',
  auth: '추천 기능 설정에 문제가 있어요.',
  network: '네트워크 오류로 추천을 가져오지 못했어요.',
} as const;

export function LabelSheet({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(stay.label ?? '');
  const [saving, setSaving] = useState(false);
  // 다른 곳에서 쓰는 이름으로 저장하려 할 때 합칠 대상 수 — null이면 확인 단계 아님
  const [mergeCount, setMergeCount] = useState<number | null>(null);
  // 좌표가 외부(카카오)로 나가는 기능이라 자동 조회 없이 버튼을 눌렀을 때만 채운다
  const [suggest, setSuggest] = useState<SuggestResult | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const onSuggest = async () => {
    setSuggestLoading(true);
    setSuggest(await fetchNearbyPlaces(stay.lat, stay.lng));
    setSuggestLoading(false);
  };

  const { data: nearbyLabels = [] } = useQuery({
    queryKey: ['nearbyLabels', stay.id],
    queryFn: () => getNearbyLabels(stay.lat, stay.lng),
  });
  const { data: allLabels = [] } = useQuery({ queryKey: ['allLabels'], queryFn: getAllLabels });

  const query = value.trim();
  // 입력 중이면 전체 라벨에서 매칭, 비었으면 근처 라벨 추천
  const suggestions = query
    ? allLabels.filter((l) => l.includes(query) && l !== query)
    : nearbyLabels;

  const doSave = async (label: string | null) => {
    setSaving(true);
    try {
      // 이름 바꾸기 = 같은 이름을 쓰던 모든 체류를 함께 바꾼다. 라벨 제거는 이 체류만.
      if (stay.label && stay.label !== label) {
        if (label) await relabelByName(stay.label, label);
        else await updateStayLabel(stay.id, null);
      } else {
        await updateStayLabel(stay.id, label);
        if (label) await relabelNearbyUnlabeled(stay.lat, stay.lng, label);
      }
      await queryClient.invalidateQueries({ queryKey: ['timeline'] });
      onClose();
    } catch (e) {
      appLog('error', 'label', String(e));
      setSaving(false);
    }
  };

  const onSave = async () => {
    // 빈 입력 저장 = 라벨 제거
    const label = value.trim() || null;
    if (label && label !== stay.label) {
      setSaving(true);
      const dup = await countStaysByLabel(label);
      setSaving(false);
      if (dup > 0) {
        setMergeCount(dup);
        return;
      }
    }
    await doSave(label);
  };

  return (
    <BottomSheet onClose={onClose} compact>
      <h2 className="text-lg font-bold text-slate-900">장소 이름</h2>
      {mergeCount !== null ? (
        <>
          <p className="pt-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">'{query}'</span>은(는) 이미 다른 기록
            {mergeCount}개가 쓰는 이름이에요. 저장하면 같은 장소로 합쳐져요.
          </p>
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={() => setMergeCount(null)}
              className="flex-1 rounded-lg bg-slate-200 py-3 text-sm font-semibold text-slate-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => doSave(query)}
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {saving ? '합치는 중…' : '합치기'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="pb-3 text-xs text-slate-400">
            {stay.lat.toFixed(5)}, {stay.lng.toFixed(5)}
          </div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="예: 집, 회사"
            className="w-full rounded-lg border border-slate-300 p-3 text-sm"
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-3">
              {suggestions.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setValue(l)}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {hasKakaoKey && suggest === null && (
            <button
              type="button"
              onClick={onSuggest}
              disabled={suggestLoading}
              className="mt-3 w-full rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 disabled:text-slate-300"
            >
              {suggestLoading ? '주변 장소 찾는 중…' : '주변 장소 추천'}
            </button>
          )}
          {suggest !== null &&
            (suggest.ok ? (
              suggest.places.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-3">
                  {suggest.places.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setValue(p.name)}
                      className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600"
                    >
                      {p.name} · {p.distanceM}m
                    </button>
                  ))}
                </div>
              ) : (
                <p className="pt-3 text-xs text-slate-400">주변에서 찾은 장소가 없어요</p>
              )
            ) : (
              <p className="pt-3 text-xs text-slate-400">{SUGGEST_ERROR_MSG[suggest.reason]}</p>
            ))}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-slate-200 py-3 text-sm font-semibold text-slate-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
