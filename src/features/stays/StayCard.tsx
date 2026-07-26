import type { RefCallback } from 'react';
import { fmtDuration, toDate } from '../../lib/date';

// 자정 넘김 체류는 양쪽 날짜 리스트에 다 떠서, 보는 날짜와 다른 날의 시각엔 날짜 표식을 붙인다
function fmtTime(ts: string, viewDate: string): string {
  const time = ts.slice(11, 16);
  const day = ts.slice(0, 10);
  if (day === viewDate) return time;
  const diff = Math.round((toDate(day).getTime() - toDate(viewDate).getTime()) / 86_400_000);
  if (diff === -1) return `${time}(어제)`;
  if (diff === 1) return `${time}(다음날)`;
  const [, m, d] = day.split('-');
  return `${time}(${Number(m)}/${Number(d)})`;
}

interface StayCardProps {
  title: string;
  live: boolean; // 진행 중 표시 — 파란 강조, 시간 '째' 접미사, 종료시각 대신 '진행 중'
  viewDate: string;
  startTs: string;
  endTs: string;
  lat: number;
  lng: number;
  selected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  cardRef?: RefCallback<HTMLLIElement>;
}

export function StayCard({
  title,
  live,
  viewDate,
  startTs,
  endTs,
  lat,
  lng,
  selected,
  onClick,
  onEdit,
  onDelete,
  cardRef,
}: StayCardProps) {
  return (
    <li
      ref={cardRef}
      onClick={onClick}
      className={`rounded-lg bg-white p-3 shadow-sm active:bg-slate-100 dark:bg-slate-900 dark:active:bg-slate-800 ${
        live ? 'border-2 border-blue-200 dark:border-blue-800' : ''
      } ${selected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={`font-semibold ${
            live ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {title}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {fmtDuration(Date.parse(endTs) - Date.parse(startTs))}
          {live ? '째' : ''}
        </span>
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {fmtTime(startTs, viewDate)} ~ {live ? '진행 중' : fmtTime(endTs, viewDate)}
      </div>
      {/* 좌표는 매일 보는 정보가 아니라서 펼쳤을 때만 (U19) */}
      {selected && (
        <>
          <div className="pt-1 text-xs text-slate-400 dark:text-slate-500">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex-1 rounded-md bg-blue-50 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              수정
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex-1 rounded-md bg-red-50 py-2 text-sm font-semibold text-red-600 dark:bg-red-950 dark:text-red-400"
              >
                삭제
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
