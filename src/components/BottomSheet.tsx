import type { ReactNode } from 'react';

interface BottomSheetProps {
  onClose: () => void; // 배경 탭 닫기 — 시트 내부 탭은 전파를 막아 닫히지 않는다
  compact?: boolean; // 달력 그리드·라벨 입력처럼 폭이 필요한 시트는 p-4
  children: ReactNode;
}

export function BottomSheet({ onClose, compact, children }: BottomSheetProps) {
  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className={`rounded-t-2xl bg-white ${compact ? 'p-4' : 'p-5'} pb-8`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
