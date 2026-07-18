export type AppLogLevel = 'info' | 'warn' | 'error';

// 내부 오류 진단용 콘솔 로거 — 오류 처리 경로에서 호출되므로 절대 throw하지 않는다
export function appLog(level: AppLogLevel, tag: string, message: string): void {
  console[level](`[${tag}] ${message}`);
}
