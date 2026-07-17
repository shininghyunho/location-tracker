import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';
// 플러그인 본체(dist)는 default export만 내보내서, enum 값은 타입 패키지에서 직접 가져온다
import { DesiredAccuracy } from '@transistorsoft/background-geolocation-types';
import { LocalNotifications } from '@capacitor/local-notifications';
import { insertPoint } from '../../db/points';

const isNative = Capacitor.isNativePlatform();

// U6: 1분 간격 (PRD §8). 실사용하며 조정 예정이라 설정화 대상
const SAVE_INTERVAL_MS = 60_000;

// 플러그인 네이티브 저장 레코드 중 우리가 쓰는 필드만
interface StoredLocation {
  uuid: string;
  timestamp: string | number;
  coords: { latitude: number; longitude: number; accuracy?: number };
}

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
  const drainingRef = useRef(false);

  // 저장 주체는 플러그인의 네이티브 SQLite다 — 앱이 죽어 있는 동안의 위치도 거기 쌓인다.
  // 회수는 "옮긴 레코드만 uuid로 삭제"라서, 회수 도중 새로 쌓인 레코드를 지우지 않는다.
  async function drain() {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const records = (await BackgroundGeolocation.getLocations()) as StoredLocation[];
      for (const r of records) {
        const epochMs = typeof r.timestamp === 'number' ? r.timestamp : Date.parse(r.timestamp);
        await insertPoint({
          ts: toLocalIso(epochMs),
          lat: r.coords.latitude,
          lng: r.coords.longitude,
          accuracy_m: r.coords.accuracy ?? null,
          source: 'collector',
        });
        await BackgroundGeolocation.destroyLocation(r.uuid);
      }
      if (records.length > 0) onPointSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      drainingRef.current = false;
    }
  }

  useEffect(() => {
    if (!isNative) return;

    const locationSub = BackgroundGeolocation.onLocation(
      () => void drain(),
      (err) => setError(`위치 오류 코드 ${err}`),
    );
    // 정지 상태에선 플러그인이 GPS를 쉬므로, 앱이 살아있는 동안엔 heartbeat로 1분 간격을 유지
    const heartbeatSub = BackgroundGeolocation.onHeartbeat(() => {
      BackgroundGeolocation.getCurrentPosition({ samples: 1, persist: true, timeout: 30 }).catch(() => {});
    });

    BackgroundGeolocation.ready({
      geolocation: {
        desiredAccuracy: DesiredAccuracy.High,
        distanceFilter: 0,
        locationUpdateInterval: SAVE_INTERVAL_MS,
        disableElasticity: true,
        locationAuthorizationRequest: 'Always',
      },
      app: {
        heartbeatInterval: SAVE_INTERVAL_MS / 1000,
        stopOnTerminate: false, // 앱을 스와이프로 꺼도 수집 유지
        startOnBoot: true, // 재부팅 후 자동 재개
        notification: { title: '위치 수집 중', text: '이동 기록을 저장하고 있습니다.' },
      },
    })
      .then((state) => {
        setIsCollecting(state.enabled);
        if (state.enabled) void drain(); // 앱이 꺼져 있던 동안의 백로그 회수
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      locationSub.remove();
      heartbeatSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    if (!isNative) {
      setError('백그라운드 수집은 기기(Android)에서만 동작합니다. 웹은 UI 확인용.');
      return;
    }
    try {
      // Android 13+: 포그라운드 서비스 알림 표시에 알림 권한이 필요
      const noti = await LocalNotifications.checkPermissions();
      if (noti.display !== 'granted') await LocalNotifications.requestPermissions();

      await BackgroundGeolocation.start();
      setIsCollecting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stop() {
    if (isNative) await BackgroundGeolocation.stop();
    setIsCollecting(false);
  }

  return { isCollecting, error, start, stop };
}
