import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';

interface AboutSheetProps {
  onClose: () => void;
}

export function AboutSheet({ onClose }: AboutSheetProps) {
  // 설치된 앱의 versionName을 그대로 표기 — 버전 올려도 문구 수정 불필요
  const [version, setVersion] = useState('');
  useEffect(() => {
    CapApp.getInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion('dev'));
  }, []);

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">위치트래커</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">
          <p>
            <b className="text-slate-900">위치트래커</b>는 내가 하루 중{' '}
            <b className="text-blue-600">어디에 가장 오래 머무는지 기록</b>하고{' '}
            <b className="text-blue-600">통계</b>로 보여주는 앱이에요.
          </p>
          <p>
            모든 기록은 서버 없이 <b className="text-emerald-600">내 폰 안에만 저장</b>돼요. 밖으로
            나가는 데이터가 하나도 없어서{' '}
            <b className="text-emerald-600">보안 걱정은 안 하셔도 됩니다</b>.
          </p>
          <p>
            <b className="text-blue-600">구글 지도의 타임라인</b> 기록을 가져와서 이어볼 수도
            있어요.
          </p>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <p>버전 {version}</p>
          <a
            href="https://github.com/shininghyunho/location-tracker"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-blue-500 underline"
          >
            github.com/shininghyunho/location-tracker
          </a>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
