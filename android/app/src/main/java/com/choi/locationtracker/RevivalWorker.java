package com.choi.locationtracker;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.transistorsoft.locationmanager.adapter.BackgroundGeolocation;
import com.transistorsoft.locationmanager.adapter.callback.TSCallback;
import com.transistorsoft.locationmanager.config.TSConfig;

// 상시 포그라운드로도 못 막는 킬(강제종료·재부팅 직후·제조사 절전) 대비. WorkManager가 프로세스가
// 죽어 있어도 15분 주기로 이 잡을 깨우고, 잡 실행 자체가 프로세스를 되살린다. 수집이 켜진(enabled)
// 상태면 tracking을 재기동한다 — start()는 멱등이라 이미 살아있을 때 실행돼도 무해하다.
public class RevivalWorker extends Worker {

    public RevivalWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            Context context = getApplicationContext();
            TSConfig config = TSConfig.getInstance(context);
            // 유저가 직접 수집을 끈 상태(enabled=false)에선 아무것도 하지 않는다
            if (config.getEnabled()) {
                BackgroundGeolocation.getInstance(context).start(new TSCallback() {
                    // disableStopDetection은 시작 시 stationary를 moving으로 올려주지 않으므로 직접 moving을 강제해 상시 포그라운드를 유지한다
                    @Override public void onSuccess() {
                        BackgroundGeolocation.getInstance(context).changePace(true, new TSCallback() {
                            @Override public void onSuccess() {}
                            @Override public void onFailure(String error) {}
                        });
                    }
                    @Override public void onFailure(String error) {}
                });
            }
        } catch (Exception e) {
            // 예외를 삼켜 잡 스케줄이 크래시로 날아가지 않게 한다. WorkManager가 다음 주기에 재시도한다.
        }
        return Result.success();
    }
}
