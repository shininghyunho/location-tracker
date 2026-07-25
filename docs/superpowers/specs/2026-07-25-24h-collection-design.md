# 24시간 무공백 GPS 수집 설계 (2026-07-25)

> 분석 기준: 2026-07-25, 커밋 964da02

## 배경과 문제

정지 상태에서 플러그인(@transistorsoft/capacitor-background-geolocation)이 포그라운드
서비스를 내려놓아 앱 프로세스가 캐시 상태(importance 300~400)로 밀리고, OS의
메모리 회수(LMK)나 제조사 절전이 프로세스를 통째로 죽인다. 죽은 뒤에는 되살릴
주체가 없어(heartbeat는 프로세스 내부, 모션 트리거는 이동 시에만 발화) 정지
중이면 몇 시간씩 수집 공백이 생긴다. 7/20 12:16~20:14 공백이 대표 사례이며,
U36(HeadlessTask) 이후에도 매일 재발했다. 배터리 최적화 예외·standby EXEMPTED·
appops 허용은 이미 적용돼 있고, 이것들로는 LMK 킬을 막지 못함을 확인했다.

## 요구사항

1. 24시간 GPS 수집이 가능해야 한다. 공백은 15분 이하까지 허용.
2. 배터리 소모가 극도로 늘어나면 안 된다.
3. 수집 중 유저에게 알림이 갈 필요 없다. 무음 + 상태바 숨김 + 알림함
   최하단 접힘이면 충분(포그라운드 서비스 특성상 완전 제거는 OS 정책상 불가).

## 접근: C안 = 상시 포그라운드(B) + 15분 부활 잡(A)

관측된 킬은 전부 비-포그라운드(캐시) 상태에서 발생했다. 서비스를 상시
포그라운드(importance ~125)로 유지하면 킬 자체가 구조적으로 거의 사라지고(B),
그래도 죽는 경우(강제종료·재부팅 직후·제조사 절전)를 WorkManager 주기 잡이
15분 이내에 되살린다(A).

### 1. BGGeo 설정 변경 — `src/features/collector/useCollector.ts`

- `disableStopDetection: true` 추가 → 플러그인이 정지 감지를 하지 않고 항상
  tracking 상태 유지 = 포그라운드 서비스가 내려가지 않는다.
- 기존 `distanceFilter: 0` + `locationUpdateInterval: 60_000` 조합으로 정지
  중에도 1분당 1픽스가 네이티브 SQLite에 자동 저장된다. JS 생존이 필요 없어
  기존 heartbeat→getCurrentPosition 경로보다 단순하고 견고하다.
- `notification.priority: NotificationPriority.Min(-2)` 추가 → 무음, 상태바
  아이콘 숨김, 알림함 최하단 접힘. 제목/본문은 기존 유지(알림함을 펼쳤을 때만
  보임). Android 13+에선 유저가 알림을 스와이프로 지워도 서비스는 유지된다.
- 기존 heartbeat 구독과 U36 HeadlessTask는 제거하지 않는다 — tracking 상태가
  깨진 예외 상황의 백스톱이며 충돌하지 않는다.

배터리: GPS 듀티 사이클은 지금도 1분당 1픽스(heartbeat 경로)라 살아있는 시간의
소모는 동일하다. 늘어나는 소모는 "이전엔 죽어서 수집 못 하던 시간에 실제로
수집하는 몫"뿐이며, 이는 요구사항 1의 대가로 수용한다.

### 2. 부활 잡 — 네이티브 `RevivalWorker` 신규 (`android/`)

- androidx.work `PeriodicWorkRequest`, 15분 주기(WorkManager 최소 간격).
- 로직: 플러그인 설정(TSConfig)상 수집이 enabled인데 tracking 서비스가 돌고
  있지 않으면 재기동한다. 멱등이라 서비스가 살아있을 때 실행돼도 무해하다.
- 등록: Application 시작 시 `ExistingPeriodicWorkPolicy.KEEP`으로 enqueue.
  WorkManager 잡은 OS에 영속 저장되어 프로세스가 죽어 있어도 스케줄이 유지되고,
  잡 실행 자체가 프로세스를 되살린다. 배터리 최적화 예외가 이미 있어 Doze
  지연도 최소화된다.
- 수집을 유저가 직접 끈 상태(enabled=false)에선 아무것도 하지 않는다.

### 3. 수동 1회 설정 — 삼성 "절대 잠자지 않는 앱"

설정 > 배터리 > 백그라운드 사용 제한 > 절대 잠자지 않는 앱에 위치트래커 등록.
삼성 절전 계열 킬(reason=10 USER_REQUESTED 관측)을 줄인다. adb로 설정 불가라
수동 1회이며, README에 절차를 기록한다.

## 오류 처리

- RevivalWorker에서 재기동 실패 시 예외를 삼키고 다음 주기에 재시도(WorkManager
  기본 동작). 크래시로 잡 스케줄이 날아가지 않게 try-catch로 감싼다.
- disableStopDetection 적용 후에도 공백이 재발하면 transistor_log.db와
  exit-info로 원인을 재진단한다(기존 진단 절차 재사용).

## 검증 계획 (실기기 A54)

1. 알림: 무음·상태바 아이콘 없음·알림함 최하단 접힘 육안 확인.
2. 상시 FGS: `dumpsys activity exit-info`/`dumpsys activity services`에서
   정지 중에도 서비스 생존(importance 125) 확인.
3. 부활: `adb shell am kill`(force-stop 아님)로 프로세스 강제 종료 후 15분 내
   자동 부활과 수집 재개 확인.
4. 1일 관찰: points 테이블 30분 이상 공백 쿼리 재실행 → 공백 0건이 성공 기준.
   `dumpsys batterystats`로 앱 배터리 지분을 이전과 비교.

## 리스크와 후퇴선

- 배터리가 체감되게 늘면 1차로 수집 간격 60초→120초 완화, 그래도 과하면
  disableStopDetection을 롤백하고 부활 잡(A)만 유지(공백 ≤15분은 A만으로도 충족).
- 절대 무공백은 불가능하다(강제종료·재부팅 직후 등). 계약은 "공백 ≤15분 캡 +
  U34 브리징이 체류 출력에서 공백 흡수"다.

## 범위 밖

- iOS 대응(안드로이드 전용 문제).
- 체류 판정 로직 변경(U34로 이미 해결).
