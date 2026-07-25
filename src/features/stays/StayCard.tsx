import type { RefCallback } from 'react';
import { fmtDuration } from '../../lib/date';

function fmtTime(ts: string): string {
  return ts.slice(11, 16);
}

interface StayCardProps {
  title: string;
  live: boolean; // 진행 중 표시 — 파란 강조, 시간 '째' 접미사, 종료시각 대신 '진행 중'
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
      className={`rounded-lg bg-white p-3 shadow-sm active:bg-slate-100 ${
        live ? 'border-2 border-blue-200' : ''
      } ${selected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`font-semibold ${live ? 'text-blue-700' : 'text-slate-900'}`}>
          {title}
        </span>
        <span className="text-sm text-slate-500">
          {fmtDuration(Date.parse(endTs) - Date.parse(startTs))}
          {live ? '째' : ''}
        </span>
      </div>
      <div className="text-sm text-slate-500">
        {fmtTime(startTs)} ~ {live ? '진행 중' : fmtTime(endTs)}
      </div>
      {/* 좌표는 매일 보는 정보가 아니라서 펼쳤을 때만 (U19) */}
      {selected && (
        <>
          <div className="pt-1 text-xs text-slate-400">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex-1 rounded-md bg-blue-50 py-2 text-sm font-semibold text-blue-700"
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
                className="flex-1 rounded-md bg-red-50 py-2 text-sm font-semibold text-red-600"
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
