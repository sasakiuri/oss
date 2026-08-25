import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDaysInMonth, getFirstDayOfMonth } from './dateUtils';

interface CalendarPopupProps {
  selectedDate: string; // ISO "YYYY-MM-DD"
  onSelect: (isoDate: string) => void;
  onClose: () => void;
}

export function CalendarPopup({ selectedDate, onSelect }: CalendarPopupProps) {
  const today = new Date();
  const parsed = selectedDate ? new Date(selectedDate) : null;
  const initialYear = parsed && !isNaN(parsed.getTime()) ? parsed.getFullYear() : today.getFullYear();
  const initialMonth = parsed && !isNaN(parsed.getTime()) ? parsed.getMonth() + 1 : today.getMonth() + 1;

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleDayClick = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelect(iso);
  };

  return (
    <div
      role="dialog"
      aria-label="Choose a date"
      className="rounded-sm border border-vscode-border bg-vscode-bg-light p-3 shadow-2xl shadow-black/50"
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="Show previous month"
          className="flex h-8 w-8 items-center justify-center rounded-sm text-vscode-text-muted transition-colors hover:bg-vscode-hover hover:text-vscode-text"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold text-vscode-text">
          {viewYear} / {viewMonth}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="Show next month"
          className="flex h-8 w-8 items-center justify-center rounded-sm text-vscode-text-muted transition-colors hover:bg-vscode-hover hover:text-vscode-text"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((day) => (
          <div key={day} className="pb-1 text-center text-xs font-medium text-vscode-dimmed">
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISO;

          let className = 'h-8 w-8 rounded-sm text-sm text-vscode-text transition-colors hover:bg-vscode-hover';
          if (isSelected) {
            className = 'h-8 w-8 rounded-sm bg-vscode-primary text-sm font-semibold text-white';
          } else if (isToday) {
            className =
              'h-8 w-8 rounded-sm border border-vscode-primary text-sm text-vscode-text transition-colors hover:bg-vscode-hover';
          }

          return (
            <button key={day} type="button" onClick={() => handleDayClick(day)} className={className}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
