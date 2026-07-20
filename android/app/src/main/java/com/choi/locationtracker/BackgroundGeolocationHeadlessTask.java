package com.choi.locationtracker;

import com.transistorsoft.locationmanager.adapter.BackgroundGeolocation;
import com.transistorsoft.locationmanager.event.HeadlessEvent;
import com.transistorsoft.locationmanager.location.TSCurrentPositionRequest;

import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;

// 앱 프로세스(WebView)가 죽어 있으면 useCollector의 onHeartbeat가 못 받아 정지 중 위치가
// 통째로 빈다. 플러그인이 enableHeadless=true일 때 이 클래스(고정 이름)를 리플렉션으로 찾아
// EventBus에 등록하므로, heartbeat를 여기서 받아 JS와 동일하게 위치를 요청·저장한다.
// persist된 레코드는 플러그인 네이티브 SQLite에 쌓였다가 앱을 다시 열면 drain()이 회수한다.
public class BackgroundGeolocationHeadlessTask {

    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onHeadlessEvent(HeadlessEvent event) {
        if (!"heartbeat".equals(event.getName())) return;
        TSCurrentPositionRequest request = new TSCurrentPositionRequest.Builder(event.getContext())
                .setSamples(1)
                .setPersist(true)
                .setTimeout(30)
                .build();
        BackgroundGeolocation.getInstance(event.getContext()).getCurrentPosition(request);
    }
}
