/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 앱 내 테마 3택(시스템/라이트/다크) — OS 미디어쿼리 대신 html.dark 클래스로 판정
  darkMode: 'selector',
  theme: {
    extend: {
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.24s ease-out',
        'slide-in-left': 'slide-in-left 0.24s ease-out',
      },
    },
  },
  plugins: [],
};
