// PRD §4 기본값. 하드코딩 금지 — 실사용하며 조정할 설정값
export interface StayParams {
  radiusM: number;
  minDurationMs: number;
  graceMs: number; // 반경 밖 연속 체류가 이보다 짧으면 이탈로 보지 않고 흡수(blip)
  maxAccuracyM: number; // 이보다 부정확한 점은 판정 전 제외
  // 정지 중엔 수집 엔진이 GPS를 꺼(배터리 절약) 점이 안 쌓인다. 같은 장소에서 이만큼까지
  // 벌어진 공백은 "계속 머문 것"으로 보고 한 체류로 잇는다 — 그동안 이동했다면 모션 감지로
  // 점이 남았을 것이기에, 같은 장소의 공백은 이탈이 아닌 정지의 증거다. 이보다 길면
  // 수집 자체가 죽은 것(폰 꺼짐 등)으로 보고 연속을 주장하지 않는다.
  bridgeMaxGapMs: number;
}

export const DEFAULT_STAY_PARAMS: StayParams = {
  radiusM: 100,
  minDurationMs: 10 * 60_000,
  graceMs: 5 * 60_000,
  maxAccuracyM: 100,
  bridgeMaxGapMs: 16 * 3_600_000, // 밤샘 정지는 덮되(수면+아침 여유) 하루 미만 — 그 이상은 수집 사망
};
