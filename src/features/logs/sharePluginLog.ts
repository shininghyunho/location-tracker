import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';

// 플러그인 네이티브 로그를 파일로 뽑아 공유 시트로 넘긴다 — 목적지는 사용자가 시트에서 선택
export async function sharePluginLog(): Promise<void> {
  const log = await BackgroundGeolocation.logger.getLog();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fileName = `plugin-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.txt`;
  const written = await Filesystem.writeFile({
    path: fileName,
    data: log,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  await Share.share({ title: fileName, files: [written.uri] });
}
