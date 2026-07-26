// 방향 이동 slide-in 공통 — key remount와 짝지어 새 콘텐츠가 이동 방향에서 밀려 들어온다
export type SlideDir = 'next' | 'prev' | null;

export function slideClass(dir: SlideDir): string {
  if (dir === 'next') return 'animate-slide-in-right';
  if (dir === 'prev') return 'animate-slide-in-left';
  return '';
}
