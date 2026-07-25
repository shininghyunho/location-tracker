import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BottomSheet } from '../../components/BottomSheet';
import { countPoints } from '../../db/points';
import { countStays } from '../../db/stays';
import { appLog } from '../../lib/appLog';
import { todayStr } from '../../lib/date';
import { exportBackup, getLastExportAt } from './exportBackup';

interface BackupSheetProps {
  onClose: () => void;
}

// '2026-07-10 (15일 전)' — 백업이 오래됐는지 한눈에 보이게 경과일을 붙인다
function fmtLastExport(iso: string): string {
  const day = iso.slice(0, 10);
  const diff = Math.floor((Date.parse(todayStr()) - Date.parse(day)) / 86_400_000);
  return diff === 0 ? `${day} (오늘)` : `${day} (${diff}일 전)`;
}

export function BackupSheet({ onClose }: BackupSheetProps) {
  const [exporting, setExporting] = useState(false);
  const [lastExportAt, setLastExportAt] = useState(getLastExportAt);
  const { data: pointCount = 0 } = useQuery({ queryKey: ['backup', 'points'], queryFn: countPoints });
  const { data: stayCount = 0 } = useQuery({ queryKey: ['backup', 'stays'], queryFn: countStays });

  const onExport = async () => {
    setExporting(true);
    try {
      if (await exportBackup()) setLastExportAt(getLastExportAt());
    } catch (err) {
      appLog('error', 'backup', String(err));
      window.alert('내보내기 실패 — 저장 공간을 확인해주세요');
    } finally {
      setExporting(false);
    }
  };

  return (
    <BottomSheet onClose={onClose}>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">데이터 백업</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        위치와 체류 기록 전체를 파일 하나로 내보내요.
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500 dark:text-slate-400">보관 중인 기록</dt>
          <dd className="text-slate-700 dark:text-slate-300">
            위치 {pointCount.toLocaleString()}건 · 체류 {stayCount.toLocaleString()}건
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500 dark:text-slate-400">마지막 내보내기</dt>
          <dd className="text-slate-700 dark:text-slate-300">
            {lastExportAt ? fmtLastExport(lastExportAt) : '없음'}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => void onExport()}
        disabled={exporting}
        className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        {exporting ? '내보내는 중…' : 'JSON으로 내보내기'}
      </button>
      <p className="mt-2.5 text-center text-xs text-slate-400 dark:text-slate-500">
        드라이브나 메신저로 보내 보관하세요. &lsquo;가져오기&rsquo;로 언제든 복원할 수 있어요.
      </p>
    </BottomSheet>
  );
}
