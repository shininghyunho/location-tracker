export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_KEY = 'themeMode';

// index.html 인라인 스크립트가 같은 키로 .dark를 선적용한다 — 로직 바꾸면 그쪽도 함께
export function getThemeMode(): ThemeMode {
  const raw = localStorage.getItem(THEME_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function setThemeMode(mode: ThemeMode) {
  if (mode === 'system') localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, mode);
  applyTheme();
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  const mode = getThemeMode();
  const dark = mode === 'dark' || (mode === 'system' && systemDark.matches);
  document.documentElement.classList.toggle('dark', dark);
  // UA 렌더링(폼 컨트롤·confirm·스크롤바)도 앱 선택을 따르게 강제
  document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode;
}

// 시스템 모드로 쓰는 중 OS 테마가 바뀌면 실시간 반영
systemDark.addEventListener('change', applyTheme);
