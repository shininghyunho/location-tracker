import { useState } from 'react';
import { AuthorizationStatus } from '@transistorsoft/background-geolocation-types';

interface CollectorSheetProps {
  isCollecting: boolean;
  permStatus: AuthorizationStatus | null;
  totalPoints: number;
  onStart: () => void; // 부모가 권한 상태에 따라 사전 모달(U9) 또는 즉시 시작을 결정
  onStop: () => void;
  onClose: () => void;
}

// null = 아직 못 읽은 상태(웹, 네이티브 초기화 전)
function permLabel(status: AuthorizationStatus | null): string {
  switch (status) {
    case AuthorizationStatus.Always:
      return '항상 허용';
    case AuthorizationStatus.WhenInUse:
      return '앱 사용 중만 허용';
    case AuthorizationStatus.Denied:
      return '거부됨';
    case AuthorizationStatus.Restricted:
      return '제한됨';
    default:
      return '미확인';
  }
}

// 헤더 상태 pill 탭 시 뜨는 수집 상태 시트. 시작/중지를 홈 화면에서 여기로 옮겨
// 오탭으로 수집이 꺼지는(=기록에 구멍 나는) 사고를 막는다 — 중지는 확인 단계를 한 번 더 거친다.
export function CollectorSheet({
  isCollecting,
  permStatus,
  totalPoints,
  onStart,
  onStop,
  onClose,
}: CollectorSheetProps) {
  const [confirmStop, setConfirmStop] = useState(false);
  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">수집 상태</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">상태</dt>
            <dd
              className={
                isCollecting ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-500'
              }
            >
              {isCollecting ? '켜짐 · 1분 간격' : '꺼짐'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">위치 권한</dt>
            <dd className="text-slate-700">{permLabel(permStatus)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">누적 위치</dt>
            <dd className="text-slate-700">{totalPoints.toLocaleString()} points</dd>
          </div>
        </dl>
        <div className="mt-5">
          {!isCollecting ? (
            <button
              type="button"
              onClick={onStart}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white"
            >
              수집 시작
            </button>
          ) : confirmStop ? (
            <div>
              <p className="text-sm text-red-600">중지하면 다시 켤 때까지 이동이 기록되지 않아요.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmStop(false)}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600"
                >
                  계속 수집
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white"
                >
                  정말 중지
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmStop(true)}
              className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-600"
            >
              수집 중지
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
