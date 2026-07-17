import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { getAllPoints } from '../../db/points';
import { getAllStays } from '../../db/stays';

// U7 확정 포맷: JSON Lines — 한 줄이 레코드 하나, type 필드로 point/stay 구분
function buildJsonl(points: Awaited<ReturnType<typeof getAllPoints>>, stays: Awaited<ReturnType<typeof getAllStays>>): string {
  const lines = [
    ...points.map(({ id: _id, ...p }) => JSON.stringify({ type: 'point', ...p })),
    ...stays.map(({ id: _id, ...s }) => JSON.stringify({ type: 'stay', ...s })),
  ];
  return lines.join('\n') + '\n';
}

function exportFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tracker-export-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.jsonl`;
}

export interface ExportResult {
  pointCount: number;
  stayCount: number;
}

export async function exportData(): Promise<ExportResult> {
  const [points, stays] = await Promise.all([getAllPoints(), getAllStays()]);
  const jsonl = buildJsonl(points, stays);
  const fileName = exportFileName();

  if (Capacitor.isNativePlatform()) {
    // 캐시에 쓰고 공유 시트로 넘긴다 — 목적지(파일 저장·드라이브 등)는 사용자가 시트에서 선택
    const written = await Filesystem.writeFile({
      path: fileName,
      data: jsonl,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: fileName, files: [written.uri] });
  } else {
    const url = URL.createObjectURL(new Blob([jsonl], { type: 'application/jsonl' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { pointCount: points.length, stayCount: stays.length };
}
