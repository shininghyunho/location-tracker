import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { getLogsBefore } from '../../db/logs';
import { sharePluginLog } from './sharePluginLog';

const LEVEL_COLOR = {
  info: 'text-slate-500',
  warn: 'text-amber-600',
  error: 'text-red-600',
} as const;

const PAGE_SIZE = 100;

export function LogPanel({ onClose }: { onClose: () => void }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['logs'],
    queryFn: ({ pageParam }) => getLogsBefore(pageParam, PAGE_SIZE),
    initialPageParam: null as number | null,
    // 페이지가 꽉 찼으면 마지막 행의 id가 다음 커서, 모자라면 끝
    getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : last[last.length - 1].id),
  });
  const logs = data?.pages.flat() ?? [];
  const [sharing, setSharing] = useState(false);

  // 리스트 바닥의 센티널이 보이면 다음 페이지 로드
  const sentinelRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) fetchNextPage({ cancelRefetch: false });
    });
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage]);

  const onShare = async () => {
    setSharing(true);
    try {
      await sharePluginLog();
    } catch {
      // 공유 시트를 취소해도 reject되므로 조용히 무시한다
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-slate-50 p-4">
      <header className="flex items-center justify-between pb-3 pt-6">
        <h2 className="text-lg font-bold text-slate-900">앱 로그</h2>
        <div className="flex gap-2">
          {Capacitor.isNativePlatform() && (
            <button
              type="button"
              onClick={onShare}
              disabled={sharing}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 disabled:text-slate-300"
            >
              {sharing ? '공유 중…' : '플러그인 로그 공유'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
          >
            닫기
          </button>
        </div>
      </header>

      <ul className="flex flex-col gap-1 overflow-y-auto text-xs">
        {logs.map((l) => (
          <li key={l.id} className="rounded bg-white p-2 shadow-sm">
            <div className="flex justify-between text-slate-400">
              <span className={`font-semibold ${LEVEL_COLOR[l.level]}`}>
                {l.level.toUpperCase()} · {l.tag}
              </span>
              <span>{l.ts.slice(5, 19)}</span>
            </div>
            <div className="break-all text-slate-700">{l.message}</div>
          </li>
        ))}
        {logs.length === 0 && (
          <li className="p-6 text-center text-slate-400">저장된 로그가 없습니다</li>
        )}
        {hasNextPage && (
          <li ref={sentinelRef} className="p-2 text-center text-slate-400">
            {isFetchingNextPage ? '불러오는 중…' : ''}
          </li>
        )}
      </ul>
    </div>
  );
}
