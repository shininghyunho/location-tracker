package com.choi.locationtracker;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {

    private static final String REVIVAL_WORK_NAME = "revival-worker";

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

        // 프로세스가 죽어도 OS에 영속되는 15분 주기 부활 잡. KEEP이라 이미 등록돼 있으면 그대로 둔다.
        PeriodicWorkRequest revival = new PeriodicWorkRequest.Builder(
                RevivalWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(getApplicationContext())
                .enqueueUniquePeriodicWork(REVIVAL_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, revival);
    }
}
