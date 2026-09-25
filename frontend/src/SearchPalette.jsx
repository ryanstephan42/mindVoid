import React, { useEffect, useMemo, useRef, useState } from 'react';

const normalize = (value) => (value || '').toString();
const isBoundary = (text, index) => index === 0 || /[^a-z0-9]/i.test(text[index - 1]);

const matchField = (value, query) => {
  const text = normalize(value);
  const lower = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return null;

  if (lower.startsWith(needle)) {
    return { score: 0, start: 0, end: needle.length, indices: null };
  }

  for (let index = 0; index <= lower.length - needle.length; index += 1) {
    if (isBoundary(lower, index) && lower.startsWith(needle, index)) {
      return { score: 10 + index / 10000, start: index, end: index + needle.length, indices: null };
    }
  }

  const exactIndex = lower.indexOf(needle);
  if (exactIndex !== -1) {
    return { score: 20 + exactIndex / 10000, start: exactIndex, end: exactIndex + needle.length, indices: null };
  }

  const indices = [];
  let cursor = 0;
  for (const char of needle) {
    cursor = lower.indexOf(char, cursor);
    if (cursor === -1) return null;
    indices.push(cursor);
    cursor += 1;
  }

  return {
    score: 40 + (indices[indices.length - 1] - indices[0]) / 10000,
    start: indices[0],
    end: indices[indices.length - 1] + 1,
    indices,
  };
};

const highlightText = (text, match) => {
  const value = normalize(text);
  if (!match) return value;

  if (match.indices) {
    const indexSet = new Set(match.indices);
    return value.split('').map((char, index) => (
      indexSet.has(index)
        ? <mark key={`${char}-${index}`} className="bg-blue-500/30 text-blue-100 rounded px-0.5">{char}</mark>
        : char
    ));
  }

  return (
    <>
      {value.slice(0, match.start)}
      <mark className="bg-blue-500/30 text-blue-100 rounded px-0.5">{value.slice(match.start, match.end)}</mark>
      {value.slice(match.end)}
    </>
  );
};

const makeSnippet = (content, match) => {
  const value = normalize(content);
  if (!value) return { text: 'No content', match: null };
  const start = match ? Math.max(0, match.start - 45) : 0;
  const end = Math.min(value.length, start + 120);
  const snippet = `${start > 0 ? '…' : ''}${value.slice(start, end)}${end < value.length ? '…' : ''}`;
  if (!match) return { text: snippet, match: null };
  const offset = start > 0 ? 1 : 0;
  const adjusted = match.indices
    ? { ...match, indices: match.indices.map((index) => index - start + offset).filter((index) => index >= 0 && index < snippet.length) }
    : { ...match, start: Math.max(0, match.start - start + offset), end: Math.min(snippet.length, match.end - start + offset) };
  return { text: snippet, match: adjusted };
};

const formatDate = (value) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const SearchPalette = ({ thoughts, onClose, onJumpToThought }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const rowRefs = useRef([]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return thoughts.slice(0, 20).map((thought) => ({ thought, score: 100, titleMatch: null, contentMatch: null }));

    return thoughts
      .map((thought) => {
        const titleMatch = matchField(thought.title || 'Untitled', trimmed);
        const contentMatch = matchField(thought.content || '', trimmed);
        if (!titleMatch && !contentMatch) return null;
        const titleScore = titleMatch ? titleMatch.score : Infinity;
        const contentScore = contentMatch ? contentMatch.score + 5 : Infinity;
        return { thought, score: Math.min(titleScore, contentScore), titleMatch, contentMatch };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || new Date(b.thought.created_at || 0) - new Date(a.thought.created_at || 0))
      .slice(0, 20);
  }, [query, thoughts]);

  const selectedIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    rowRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const chooseResult = (result) => {
    if (!result) return;
    onJumpToThought(result.thought);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(Math.max(0, results.length - 1), index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseResult(results[selectedIndex]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center px-4 pt-24" onMouseDown={onClose}>
      <div className="w-full max-w-2xl bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
        <div className="p-4 border-b border-slate-700">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-slate-900/80 border border-slate-700 rounded-full px-5 py-3 text-white outline-none focus:border-blue-500 placeholder-slate-400"
            placeholder="Search the void…"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400">No thoughts match your search.</div>
          ) : results.map((result, index) => {
            const title = result.thought.title || 'Untitled';
            const snippet = makeSnippet(result.thought.content, result.contentMatch);
            return (
              <button
                key={result.thought.id}
                ref={(element) => { rowRefs.current[index] = element; }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseResult(result)}
                className={`w-full text-left rounded-xl px-4 py-3 transition-all ${index === selectedIndex ? 'bg-blue-600/20 border border-blue-500/50' : 'border border-transparent hover:bg-slate-700/70'}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-2 h-2.5 w-2.5 rounded-full flex-shrink-0 ${result.thought.needs_action ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]' : 'bg-slate-600'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-white truncate">{highlightText(title, result.titleMatch)}</div>
                      <div className="text-xs text-slate-500 flex-shrink-0">{formatDate(result.thought.created_at)}</div>
                    </div>
                    <div className="mt-1 text-sm text-slate-300 line-clamp-2">{highlightText(snippet.text, snippet.match)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500 flex justify-between">
          <span>↑↓ select · Enter jump</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
};

export default SearchPalette;
