interface PermissionSheetProps {
  onConfirm: () => void; // '계속' — 부모가 실제 권한 요청+수집 시작 처리
  onClose: () => void;
}

// OS 권한 팝업 전에 왜 '항상 허용'이 필요한지 먼저 설명하는 사전 안내 모달.
// 안드로이드는 위치 백그라운드 권한을 한 번에 안 주고 '앱 사용 중'→'항상 허용' 2단계라, 맥락을 미리 준다.
export function PermissionSheet({ onConfirm, onClose }: PermissionSheetProps) {
  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">위치 ‘항상 허용’이 필요해요</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          앱이 꺼져 있거나 화면 밖에 있을 때도 이동을 기록하려면 위치 권한을 <b>‘항상 허용’</b>으로 켜야
          해요. 안드로이드는 먼저 ‘앱 사용 중 허용’을 물은 뒤 ‘항상 허용’을 한 번 더 확인합니다.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          위치 데이터는 이 기기에만 저장되고 어디에도 전송되지 않아요.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white"
          >
            계속
          </button>
        </div>
      </div>
    </div>
  );
}
