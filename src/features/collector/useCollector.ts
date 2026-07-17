import { useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { insertPoint } from '../../db/points';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

// U6: 1분 간격 (PRD §8). 실사용하며 조정 예정이라 설정화 대상
const SAVE_INTERVAL_MS = 60_000;

// PRD의 ts 포맷: ISO8601 + 로컬 타임존 오프셋 (예: 2026-07-17T13:33:09.000+09:00)
function toLocalIso(epochMs: number): string {
  const d = new Date(epochMs);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function useCollector(onPointSaved: () => void) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watcherIdRef = useRef<string | null>(null);
  const lastSavedAtRef = useRef(0);

  async function start() {
    setError(null);
    if (!Capacitor.isNativePlatform()) {
      setError('백그라운드 수집은 기기(Android)에서만 동작합니다. 웹은 UI 확인용.');
      return;
    }
    try {
      // Android 13+: 포그라운드 서비스 알림 표시에 알림 권한이 필요
      const noti = await LocalNotifications.checkPermissions();
      if (noti.display !== 'granted') await LocalNotifications.requestPermissions();

      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: '위치 수집 중',
          backgroundMessage: '이동 기록을 저장하고 있습니다.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
        },
        (location, err) => {
          if (err) {
            setError(`${err.code ?? 'ERROR'}: ${err.message}`);
            return;
          }
          if (!location) return;
          const now = Date.now();
          if (now - lastSavedAtRef.current < SAVE_INTERVAL_MS) return;
          lastSavedAtRef.current = now;
          insertPoint({
            ts: toLocalIso(location.time ?? now),
            lat: location.latitude,
            lng: location.longitude,
            accuracy_m: location.accuracy ?? null,
            source: 'collector',
          }).then(onPointSaved);
        },
      );
      watcherIdRef.current = id;
      setIsCollecting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stop() {
    if (watcherIdRef.current) {
      await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
      watcherIdRef.current = null;
    }
    lastSavedAtRef.current = 0;
    setIsCollecting(false);
  }

  return { isCollecting, error, start, stop };
}
