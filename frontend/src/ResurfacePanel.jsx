import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from './api';

const relativeTime = (value) => {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'at an unknown time';
  const diff = Math.max(0, Date.now() - timestamp);
  const units = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
  ];
  for (const [label, size] of units) {
    const count = Math.floor(diff / size);
    if (count >= 1) return `${count} ${label}${count === 1 ? '' : 's'} ago`;
  }
  return 'just now';
};

const ResurfacePanel = ({ links, onClose, onJumpToThought, onThoughtSeen }) => {
  const [thoughts, setThoughts] = useState([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        setError('');
        const response = await api.get('/thoughts/resurface', { params: { limit: 5 } });
        if (isMounted) {
          setThoughts(Array.isArray(response.data) ? response.data : []);
          setIndex(0);
        }
      } catch (loadError) {
        console.error('Unable to load resurfaced thoughts:', loadError);
        if (isMounted) setError('Unable to resurface thoughts. Please try again.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  const currentThought = thoughts[index];

  const linkedThoughtIds = useMemo(() => {
    const ids = new Set();
    links.forEach((link) => {
      ids.add(link.source_id);
      ids.add(link.target_id);
    });
    return ids;
  }, [links]);

  const advance = useCallback(() => {
    setIndex((current) => current + 1);
  }, []);

  const markSeen = useCallback(async (thought) => {
    setIsSaving(true);
    try {
      const response = await api.post(`/thoughts/${thought.id}/seen`);
      if (response.data && onThoughtSeen) onThoughtSeen(response.data);
      return response.data || thought;
    } catch (saveError) {
      console.error('Unable to mark thought seen:', saveError);
      setError('Unable to mark this thought seen. Please try again.');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [onThoughtSeen]);

  const handleRelevant = async () => {
    if (!currentThought) return;
    const updated = await markSeen(currentThought);
    if (updated) advance();
  };

  const handleJump = async () => {
    if (!currentThought) return;
    const updated = await markSeen(currentThought);
    if (updated) onJumpToThought(updated);
  };

  const isDone = !isLoading && !error && (!currentThought || index >= thoughts.length);

  return (
    <div className="absolute top-6 left-6 z-40 w-[min(380px,calc(100%-2rem))] bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-5 text-slate-200">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Resurface</h2>
          <p className="text-sm text-slate-400">Review stale or unseen thoughts.</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none" title="Close resurface panel">×</button>
      </div>

      {isLoading && <div className="text-slate-300 py-8 text-center">Finding something worth resurfacing…</div>}

      {error && (
        <div className="bg-red-950/80 border border-red-700 text-red-100 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {isDone && (
        <div className="text-center py-8">
          <div className="text-white font-semibold mb-1">Nothing to resurface.</div>
          <div className="text-sm text-slate-400">The void is quiet for now.</div>
        </div>
      )}

      {currentThought && !isLoading && !error && (
        <div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-bold text-white text-lg leading-snug">{currentThought.title || 'Untitled'}</h3>
              {currentThought.needs_action && <span className="h-2.5 w-2.5 rounded-full bg-red-500 mt-2 shadow-[0_0_12px_rgba(239,68,68,0.8)]" title="Needs action" />}
            </div>
            <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed max-h-56 overflow-y-auto">{currentThought.content || 'No content'}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-1">dumped {relativeTime(currentThought.created_at)}</span>
              {!linkedThoughtIds.has(currentThought.id) && <span className="rounded-full bg-red-600/15 border border-red-500/40 text-red-200 px-2 py-1">unlinked</span>}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <button disabled={isSaving} onClick={advance} className="px-4 py-2 text-slate-400 hover:text-white disabled:opacity-50">Skip</button>
            <button disabled={isSaving} onClick={handleJump} className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-100 disabled:opacity-50">Jump to it</button>
            <button disabled={isSaving} onClick={handleRelevant} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">Still relevant</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResurfacePanel;
