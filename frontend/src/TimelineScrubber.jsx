import React, { useMemo, useState } from 'react';

const DAY = 24 * 60 * 60 * 1000;

const formatDate = (timestamp) => {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const clampWindow = (start, end, min, max) => ({
  start: Math.max(min, Math.min(start, max)),
  end: Math.max(min, Math.min(end, max)),
});

const TimelineScrubber = ({ thoughts, windowRange, onChange, onReset, onClose }) => {
  const [fallbackNow] = useState(() => Date.now());
  const range = useMemo(() => {
    const stamps = thoughts
      .map((thought) => new Date(thought.created_at || 0).getTime())
      .filter((stamp) => Number.isFinite(stamp) && stamp > 0);
    if (stamps.length === 0) {
      return { min: fallbackNow - DAY, max: fallbackNow };
    }
    const min = Math.min(...stamps);
    const max = Math.max(...stamps);
    return min === max ? { min: min - DAY, max: max + DAY } : { min, max };
  }, [fallbackNow, thoughts]);

  const activeRange = windowRange || range;
  const isActive = Boolean(windowRange) && (windowRange.start > range.min || windowRange.end < range.max);
  const visibleCount = thoughts.filter((thought) => {
    const stamp = new Date(thought.created_at || 0).getTime();
    return Number.isFinite(stamp) && stamp >= activeRange.start && stamp <= activeRange.end;
  }).length;

  const setStart = (value) => {
    const nextStart = Number(value);
    onChange(clampWindow(Math.min(nextStart, activeRange.end), activeRange.end, range.min, range.max));
  };

  const setEnd = (value) => {
    const nextEnd = Number(value);
    onChange(clampWindow(activeRange.start, Math.max(nextEnd, activeRange.start), range.min, range.max));
  };

  const applyPreset = (duration) => {
    if (!duration) {
      onReset();
      return;
    }
    onChange(clampWindow(range.max - duration, range.max, range.min, range.max));
  };

  return (
    <div className="absolute left-1/2 top-6 z-40 w-[min(760px,calc(100%-2rem))] -translate-x-1/2 bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-4 text-slate-200">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Timeline</h2>
            {isActive && <span className="text-xs rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/40 px-2 py-0.5">filter active</span>}
          </div>
          <div className="text-sm text-slate-400">{visibleCount} of {thoughts.length} thoughts · {formatDate(activeRange.start)} — {formatDate(activeRange.end)}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className="text-sm text-blue-300 hover:text-blue-200">Reset</button>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none" title="Close timeline">×</button>
        </div>
      </div>

      <div className="relative py-3">
        <input type="range" min={range.min} max={range.max} value={activeRange.start} onChange={(event) => setStart(event.target.value)} className="w-full accent-blue-600" />
        <input type="range" min={range.min} max={range.max} value={activeRange.end} onChange={(event) => setEnd(event.target.value)} className="w-full accent-blue-600 -mt-2" />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>{formatDate(range.min)}</span>
          <span>{formatDate(range.max)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <button onClick={() => applyPreset(null)} className="px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700 text-sm hover:bg-slate-700">All time</button>
        <button onClick={() => applyPreset(7 * DAY)} className="px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700 text-sm hover:bg-slate-700">Past week</button>
        <button onClick={() => applyPreset(30 * DAY)} className="px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700 text-sm hover:bg-slate-700">Past month</button>
        <button onClick={() => applyPreset(365 * DAY)} className="px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700 text-sm hover:bg-slate-700">Past year</button>
      </div>
    </div>
  );
};

export default TimelineScrubber;
