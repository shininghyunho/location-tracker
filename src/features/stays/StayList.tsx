import type { MutableRefObject } from 'react';
import type { Stay } from '../../db/stays';
import type { StayDraft } from './detectStays';
import { StayCard } from './StayCard';

interface StayListProps {
  viewDate: string;
  stays: Stay[];
  liveStayId: number | null;
  ongoing: StayDraft | null;
  ongoingLabel: string | null;
  selected: Stay | null;
  ongoingSelected: boolean;
  slideDir: 'next' | 'prev' | null;
  cardRefs: MutableRefObject<Map<number, HTMLLIElement>>;
  onSelect: (s: Stay | null) => void;
  onToggleOngoing: () => void;
  onEdit: (s: Stay) => void;
  onDelete: (s: Stay) => void;
  onEditOngoing: () => void;
}

export function StayList({
  viewDate,
  stays,
  liveStayId,
  ongoing,
  ongoingLabel,
  selected,
  ongoingSelected,
  slideDir,
  cardRefs,
  onSelect,
  onToggleOngoing,
  onEdit,
  onDelete,
  onEditOngoing,
}: StayListProps) {
  return (
    <ul
      className={`flex flex-col gap-2 ${
        slideDir === 'next'
          ? 'animate-slide-in-right'
          : slideDir === 'prev'
            ? 'animate-slide-in-left'
            : ''
      }`}
    >
      {stays.map((s) => {
        // 이어붙여 저장 체류로 흡수된 진행 중 체류면 '진행 중'으로 표시
        const isLive = s.id === liveStayId;
        return (
          <StayCard
            key={s.id}
            title={
              isLive
                ? s.label
                  ? `${s.label}(현재 위치)`
                  : '지금 여기'
                : (s.label ?? '이름 없는 장소')
            }
            live={isLive}
            viewDate={viewDate}
            startTs={s.start_ts}
            endTs={s.end_ts}
            lat={s.lat}
            lng={s.lng}
            selected={selected?.id === s.id}
            onClick={() => onSelect(selected?.id === s.id ? null : s)}
            onEdit={() => onEdit(s)}
            onDelete={() => onDelete(s)}
            cardRef={(el) => {
              if (el) cardRefs.current.set(s.id, el);
              else cardRefs.current.delete(s.id);
            }}
          />
        );
      })}

      {/* 진행 중 카드에 삭제는 없다 — 저장 전이라 지울 row가 없고, 그 자리에 있는 한 재계산으로 곧 다시 뜬다 */}
      {ongoing && (
        <StayCard
          title={ongoingLabel ? `${ongoingLabel}(현재 위치)` : '지금 여기'}
          live
          viewDate={viewDate}
          startTs={ongoing.startTs}
          endTs={ongoing.endTs}
          lat={ongoing.lat}
          lng={ongoing.lng}
          selected={ongoingSelected}
          onClick={onToggleOngoing}
          onEdit={onEditOngoing}
        />
      )}

      {stays.length === 0 && !ongoing && (
        <li className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
          이 날짜의 체류 기록이 없습니다
        </li>
      )}
    </ul>
  );
}
