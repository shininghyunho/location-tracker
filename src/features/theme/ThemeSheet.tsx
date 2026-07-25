import { useState } from 'react';
import { BottomSheet } from '../../components/BottomSheet';
import { getThemeMode, setThemeMode } from '../../lib/theme';
import type { ThemeMode } from '../../lib/theme';

const OPTIONS: { value: ThemeMode; label: string; desc: string }[] = [
  { value: 'system', label: '시스템 설정', desc: '폰의 다크 모드 설정을 따라가요' },
  { value: 'light', label: '라이트 모드', desc: '항상 밝은 화면으로 보여요' },
  { value: 'dark', label: '다크 모드', desc: '항상 어두운 화면으로 보여요' },
];

interface ThemeSheetProps {
  onClose: () => void;
}

export function ThemeSheet({ onClose }: ThemeSheetProps) {
  const [mode, setMode] = useState(getThemeMode());

  const select = (value: ThemeMode) => {
    setThemeMode(value);
    setMode(value);
  };

  return (
    <BottomSheet onClose={onClose}>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">테마</h2>
      <div className="mt-3 space-y-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => select(opt.value)}
            className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left ${
              mode === opt.value
                ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                {opt.label}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                {opt.desc}
              </span>
            </span>
            {mode === opt.value && (
              <span className="text-blue-500 dark:text-blue-400" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
      >
        닫기
      </button>
    </BottomSheet>
  );
}
