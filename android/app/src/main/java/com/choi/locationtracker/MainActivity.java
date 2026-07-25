package com.choi.locationtracker;

import android.app.NotificationChannel;
import android.app.NotificationManager;
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

        // 위치 플러그인이 알림 채널을 DEFAULT로 하드코딩 생성해 JS의 priority:Min이 채널에 안 먹는다.
        // 채널 importance는 하향만 허용되는(상향은 무시) OS 규칙을 이용해 여기서 MIN으로 내린다.
        // 무음·상태바 아이콘 숨김·알림함 최하단 접힘 효과. 플러그인의 이후 재생성은 상향이라 무시된다.
        NotificationManager nm = getSystemService(NotificationManager.class);
        lowerChannelToMin(nm, "bggeo", "BackgroundGeolocation");
        lowerChannelToMin(nm, getPackageName() + "TSLocationManager",
                getString(R.string.app_name));
    }

    private void lowerChannelToMin(NotificationManager nm, String id, CharSequence name) {
        NotificationChannel ch = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_MIN);
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.enableLights(false);
        nm.createNotificationChannel(ch);
    }
}
