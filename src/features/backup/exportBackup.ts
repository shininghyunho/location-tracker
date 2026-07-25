import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { getAllPoints } from '../../db/points';
import { getAllStaysForBackup } from '../../db/stays';
import { todayStr } from '../../lib/date';
import { buildBackup } from './backup';

const LAST_EXPORT_KEY = 'backup.lastExportAt';

export function getLastExportAt(): string | null {
  return localStorage.getItem(LAST_EXPORT_KEY);
}

// true = 내보내기 완료, false = 공유 시트에서 사용자가 취소(실패 아님)
export async function exportBackup(): Promise<boolean> {
  const backup = buildBackup(
    await getAllPoints(),
    await getAllStaysForBackup(),
    new Date().toISOString(),
  );
  const json = JSON.stringify(backup);
  const fileName = `location-tracker-backup-${todayStr()}.json`;

  if (Capacitor.isNativePlatform()) {
    // 폰 안 저장은 분실 대비가 안 된다 — Cache에 쓴 뒤 공유 시트로 드라이브·메신저 등 밖으로 보낸다
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: fileName, files: [uri] });
    } catch {
      return false;
    }
  } else {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  return true;
}
