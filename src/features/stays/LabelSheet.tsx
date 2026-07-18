import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Stay } from '../../db/stays';
import { getNearbyLabels, relabelNearbyUnlabeled, updateStayLabel } from '../../db/stays';
import { appLog } from '../../lib/appLog';

export function LabelSheet({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(stay.label ?? '');
  const [saving, setSaving] = useState(false);

  const { data: nearbyLabels = [] } = useQuery({
    queryKey: ['nearbyLabels', stay.id],
    queryFn: () => getNearbyLabels(stay.lat, stay.lng),
  });

  const onSave = async () => {
    setSaving(true);
    try {
      // 빈 입력 저장 = 라벨 제거
      const label = value.trim() || null;
      await updateStayLabel(stay.id, label);
      if (label) await relabelNearbyUnlabeled(stay.lat, stay.lng, label);
      await queryClient.invalidateQueries({ queryKey: ['timeline'] });
      onClose();
    } catch (e) {
      appLog('error', 'label', String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="rounded-t-2xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">장소 이름</h2>
        <div className="pb-3 text-xs text-slate-400">
          {stay.lat.toFixed(5)}, {stay.lng.toFixed(5)}
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="예: 집, 회사"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
        {nearbyLabels.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-3">
            {nearbyLabels.map((l) => (
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
      </div>
    </div>
  );
}
