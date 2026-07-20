package com.choi.locationtracker;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 배터리 최적화 대상이면 Android 12+가 백그라운드에서 FGS 기동을 막아, 프로세스가 죽은 뒤
    // heartbeat가 위치 요청(LocationRequestService)을 못 띄운다(mAllowStartForeground false).
    // 최적화 제외 앱은 이 제약의 공식 예외라서, 제외될 때까지 실행 시마다 OS 다이얼로그로 요청한다.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (!pm.isIgnoringBatteryOptimizations(getPackageName())) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        }
    }
}
