import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';
// 플러그인 본체(dist)는 default export만 내보내서, enum 값은 타입 패키지에서 직접 가져온다
import {
  DesiredAccuracy,
  LogLevel,
  AuthorizationStatus,
} from '@transistorsoft/background-geolocation-types';
import { LocalNotifications } from '@capacitor/local-notifications';
import { insertPoint } from '../../db/points';
import { appLog } from '../../db/logs';
import { toLocalIso } from '../../lib/localIso';

const isNative = Capacitor.isNativePlatform();

// U6: 1분 간격 (PRD §8). 실사용하며 조정 예정이라 설정화 대상
const SAVE_INTERVAL_MS = 60_000;

// 플러그인 네이티브 저장 레코드 중 우리가 쓰는 필드만
interface StoredLocation {
  uuid: string;
  timestamp: string | number;
  coords: { latitude: number; longitude: number; accuracy?: number };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useCollector(onPointSaved: () => void) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 위치 권한 상태 — 온보딩 안내/거부 복구 UI 분기에 쓴다 (null = 아직 미확인, 웹)
  const [permStatus, setPermStatus] = useState<AuthorizationStatus | null>(null);
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
      setError(errMsg(e));
      void appLog('error', 'drain', errMsg(e));
    } finally {
      drainingRef.current = false;
    }
  }

  useEffect(() => {
    if (!isNative) return;

    const locationSub = BackgroundGeolocation.onLocation(
      () => void drain(),
      (err) => {
        setError(`위치 오류 코드 ${err}`);
        void appLog('error', 'onLocation', `위치 오류 코드 ${err}`);
      },
    );
    // 정지 상태에선 플러그인이 GPS를 쉬므로, 앱이 살아있는 동안엔 heartbeat로 1분 간격을 유지
    const heartbeatSub = BackgroundGeolocation.onHeartbeat(() => {
      BackgroundGeolocation.getCurrentPosition({ samples: 1, persist: true, timeout: 30 }).catch(
        (e) => void appLog('warn', 'heartbeat', `위치 요청 실패: ${errMsg(e)}`),
      );
    });
    // 설정에서 권한을 바꾸면(예: '앱 사용 중'→'항상 허용') 배너가 즉시 반영되도록 구독.
    // status는 number로 오지만 값 자체가 AuthorizationStatus 코드다.
    const providerSub = BackgroundGeolocation.onProviderChange((p) =>
      setPermStatus(p.status as AuthorizationStatus),
    );
    BackgroundGeolocation.getProviderState()
      .then((p) => setPermStatus(p.status as AuthorizationStatus))
      .catch(() => {});

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
      // 플러그인 네이티브 로그(서비스 생존·권한·위치 요청 내부)를 SQLite에 남긴다 — 로그 화면에서 공유 가능
      logger: { logLevel: LogLevel.Verbose, logMaxDays: 3 },
    })
      .then((state) => {
        setIsCollecting(state.enabled);
        if (state.enabled) void drain(); // 앱이 꺼져 있던 동안의 백로그 회수
      })
      .catch((e) => {
        setError(errMsg(e));
        void appLog('error', 'ready', errMsg(e));
      });

    return () => {
      locationSub.remove();
      heartbeatSub.remove();
      providerSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 위치 권한을 요청하고 결과 상태를 돌려준다. 플러그인은 버전에 따라 거부를
  // resolve(2/1) 또는 reject(숫자 코드)로 알려서, 양쪽 다 상태로 흡수한다.
  async function requestLocationPermission(): Promise<AuthorizationStatus> {
    let status: AuthorizationStatus;
    try {
      status = await BackgroundGeolocation.requestPermission();
    } catch (e) {
      status = typeof e === 'number' ? (e as AuthorizationStatus) : AuthorizationStatus.Denied;
    }
    setPermStatus(status);
    return status;
  }

  // 사전 설명 모달에서 '계속'을 누른 뒤 호출된다(App이 권한 안내 UI를 담당).
  // 거부 복구용 '권한 다시 요청'도 같은 경로 — requestPermission 재호출이 OS 흐름을 다시 태운다.
  async function start() {
    setError(null);
    if (!isNative) {
      setError('백그라운드 수집은 기기(Android)에서만 동작합니다. 웹은 UI 확인용.');
      return;
    }
    try {
      const status = await requestLocationPermission();
      // 위치 권한 자체가 없으면 수집기를 켜지 않는다 — App이 permStatus로 거부 배너를 띄운다
      if (status === AuthorizationStatus.Denied || status === AuthorizationStatus.Restricted) {
        void appLog('warn', 'collector', `위치 권한 거부 (status=${status})`);
        return;
      }
      // Android 13+: 포그라운드 서비스 알림 표시에 알림 권한이 필요
      const noti = await LocalNotifications.checkPermissions();
      if (noti.display !== 'granted') await LocalNotifications.requestPermissions();

      // WhenInUse(앱 사용 중만)여도 켠다 — 포그라운드 수집은 되고, App이 '항상 허용' 승격을 배너로 유도
      await BackgroundGeolocation.start();
      setIsCollecting(true);
      void appLog('info', 'collector', `수집 시작 (권한 status=${status})`);
    } catch (e) {
      setError(errMsg(e));
      void appLog('error', 'start', errMsg(e));
    }
  }

  async function stop() {
    if (isNative) await BackgroundGeolocation.stop();
    setIsCollecting(false);
    void appLog('info', 'collector', '수집 중지');
  }

  return { isCollecting, error, permStatus, start, stop };
}
