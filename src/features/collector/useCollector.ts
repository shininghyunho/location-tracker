import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';
// 플러그인 본체(dist)는 default export만 내보내서, enum 값은 타입 패키지에서 직접 가져온다
import {
  DesiredAccuracy,
  LogLevel,
  AuthorizationStatus,
  NotificationPriority,
} from '@transistorsoft/background-geolocation-types';
import { LocalNotifications } from '@capacitor/local-notifications';
import { batchInsertPoints } from '../../db/points';
import { appLog } from '../../lib/appLog';
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
      if (records.length === 0) return;
      await batchInsertPoints(
        records.map((r) => {
          const epochMs = typeof r.timestamp === 'number' ? r.timestamp : Date.parse(r.timestamp);
          return {
            ts: toLocalIso(epochMs),
            lat: r.coords.latitude,
            lng: r.coords.longitude,
            accuracy_m: r.coords.accuracy ?? null,
            source: 'collector' as const,
          };
        }),
      );
      // 삭제보다 화면이 먼저 — destroy는 건당 브릿지 호출이라 백로그가 크면 분 단위로 걸린다
      onPointSaved();
      for (let i = 0; i < records.length; i += 50) {
        await Promise.all(
          records.slice(i, i + 50).map((r) => BackgroundGeolocation.destroyLocation(r.uuid)),
        );
      }
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
    // disableStopDetection으로 정지 중에도 픽스가 이어지지만, tracking 상태가 깨진 예외 상황의
    // 백스톱으로 heartbeat 경로를 남긴다(앱이 살아있는 동안 1분 간격 보강).
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
      activity: {
        // 정지 감지를 끄면 포그라운드 서비스가 내려가지 않아 프로세스가 캐시로 밀려 죽는 것을 막는다.
        // geolocation 섹션에도 타입은 있지만 네이티브가 읽는 곳은 activity뿐이다
        disableStopDetection: true,
      },
      // 기본 1일이라 앱을 하루 안 열면 미회수 백로그가 삭제된다 (하루 ~0.9MB, 90일 최대 ~78MB)
      persistence: { maxDaysToPersist: 90 },
      app: {
        heartbeatInterval: SAVE_INTERVAL_MS / 1000,
        stopOnTerminate: false, // 앱을 스와이프로 꺼도 수집 유지
        startOnBoot: true, // 재부팅 후 자동 재개
        // 앱 프로세스가 죽으면 이 JS가 없어 heartbeat가 통째로 버려진다(skip heartbeat).
        // 정지 중 위치는 heartbeat로만 남으므로, 네이티브 HeadlessTask가 대신 받게 한다
        enableHeadless: true,
        // Min: 무음·상태바 아이콘 숨김·알림함 최하단 접힘 (FGS 특성상 완전 제거는 불가)
        notification: {
          title: '위치 수집 중',
          text: '이동 기록을 저장하고 있습니다.',
          priority: NotificationPriority.Min,
        },
      },
      // 플러그인 네이티브 로그(서비스 생존·권한·위치 요청 내부)를 SQLite에 남긴다 — 로그 화면에서 공유 가능
      logger: { logLevel: LogLevel.Verbose, logMaxDays: 3 },
    })
      .then((state) => {
        setIsCollecting(state.enabled);
        if (state.enabled) {
          void drain(); // 앱이 꺼져 있던 동안의 백로그 회수
          // disableStopDetection은 moving→stationary 전환만 막을 뿐, 시작 시 stationary를 moving으로 올려주진 않는다.
          // 상시 포그라운드가 되도록 moving을 강제한다(이후엔 disableStopDetection이 유지).
          BackgroundGeolocation.changePace(true).catch(
            (e) => void appLog('warn', 'changePace', errMsg(e)),
          );
        }
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
      // disableStopDetection은 시작 시 moving을 만들어주지 않으므로 직접 moving으로 올려 상시 포그라운드를 유지한다
      await BackgroundGeolocation.changePace(true).catch(
        (e) => void appLog('warn', 'changePace', errMsg(e)),
      );
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
