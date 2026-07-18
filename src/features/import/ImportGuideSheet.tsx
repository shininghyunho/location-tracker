import { useState } from 'react';
import { useSwipe } from '../../lib/useSwipe';

interface ImportGuideSheetProps {
  onPickFile: () => void; // 마지막 스텝 '파일 선택' — 부모가 파일 선택기 열기+닫기 처리
  onClose: () => void;
}

// 스크린샷 원본 = docs/resource/tl01~05.png (README 가이드와 공용), 앱 번들용은 540px webp
const STEPS = [
  {
    img: '/guide/tl01.webp',
    caption: '안드로이드 설정에서 "위치 서비스"를 검색해요',
  },
  {
    img: '/guide/tl02.webp',
    caption: '검색 결과에서 "위치 서비스"를 눌러요',
  },
  {
    img: '/guide/tl03.webp',
    caption: '"타임라인"을 눌러요',
  },
  {
    img: '/guide/tl04.webp',
    caption: '구글 계정을 고른 뒤 "타임라인 데이터 내보내기"로 타임라인.json을 저장해요',
  },
  {
    img: '/guide/tl05.webp',
    caption: '아래 버튼을 눌러 방금 저장한 타임라인.json을 선택하면 끝!',
  },
];

// 구글 타임라인 내보내기는 설정 앱 메뉴를 타야 해서 텍스트만으론 못 따라간다 — 스크린샷 스텝 카드로 안내
export function ImportGuideSheet({ onPickFile, onClose }: ImportGuideSheetProps) {
  const [step, setStep] = useState(0);
  // 메인 화면과 동일하게 이동 방향의 slide-in을 한 번 재생 (열릴 땐 없음)
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | null>(null);
  const isLast = step === STEPS.length - 1;

  const moveStep = (delta: number) => {
    const next = step + delta;
    if (next < 0 || next >= STEPS.length) return;
    setSlideDir(delta > 0 ? 'next' : 'prev');
    setStep(next);
  };

  // 왼쪽 스와이프 = 다음 스텝, 오른쪽 스와이프 = 이전 스텝
  const swipeStep = useSwipe(
    () => moveStep(1),
    () => moveStep(-1),
  );

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-slate-900">구글 타임라인 가져오기</h2>
          <span className="text-sm text-slate-400">
            {step + 1}/{STEPS.length}
          </span>
        </div>
        <div {...swipeStep} className="mt-3 overflow-x-hidden">
          {/* key={step}로 remount → 스텝이 바뀔 때마다 이동 방향의 slide-in이 한 번 재생된다 */}
          <div
            key={step}
            className={
              slideDir === 'next'
                ? 'animate-slide-in-right'
                : slideDir === 'prev'
                  ? 'animate-slide-in-left'
                  : ''
            }
          >
            <img
              src={STEPS[step].img}
              alt={`가져오기 ${step + 1}단계`}
              className="mx-auto h-[40vh] rounded-lg border border-slate-200 object-contain"
            />
            <p className="mt-3 min-h-10 text-center text-sm leading-relaxed text-slate-600">
              {STEPS[step].caption}
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => moveStep(-1)}
            disabled={step === 0}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 disabled:text-slate-300"
          >
            이전
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={onPickFile}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white"
            >
              파일 선택
            </button>
          ) : (
            <button
              type="button"
              onClick={() => moveStep(1)}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white"
            >
              다음
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
