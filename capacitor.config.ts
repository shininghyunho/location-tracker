import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.choi.locationtracker',
  appName: '위치트래커',
  webDir: 'dist',
  android: {
    // background-geolocation 요구사항: 없으면 백그라운드 5분 뒤 위치 갱신이 멈춘다
    // https://github.com/capacitor-community/background-geolocation/issues/89
    useLegacyBridge: true,
  },
};

export default config;
