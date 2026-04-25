import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { searchMovies } from "@/lib/server/tmdb";
import type { TMDBMovie } from "@/components/cards/MovieCard";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      return;
    }
    let active = true;
    searchMovies({ data: debounced }).then((res: any) => {
      if (active) setResults(res.slice(0, 5));
    });
    return () => {
      active = false;
    };
  }, [debounced]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xl transition data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 flex pt-32 justify-center">
      <div className="relative w-full max-w-xl mx-4 overflow-hidden rounded-2xl border border-white/10 bg-arc-surface shadow-2xl">
        <div className="flex items-center border-b border-white/5 px-4">
          <svg
            className="mr-3 h-5 w-5 text-arc-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent py-5 text-lg outline-none placeholder:text-arc-muted text-arc-text"
            placeholder="Search ARC Globally..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={() => setOpen(false)}
            className="text-arc-muted hover:text-white px-2 py-1 text-xs uppercase tracking-widest bg-white/5 rounded"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2 arc-scrollbar">
          {results.length > 0 ? (
            <div className="px-2">
              {results.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: "/title/$id", params: { id: m.id.toString() } });
                  }}
                  className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-white/5 focus:bg-white/5 focus:outline-none transition"
                >
                  <div className="h-10 w-8 shrink-0 overflow-hidden rounded bg-white/10">
                    {m.poster_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-arc-text">{m.title}</div>
                    <div className="text-xs text-arc-muted mt-0.5">
                      {m.release_date?.substring(0, 4)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : debounced.trim() ? (
            <div className="py-14 text-center text-sm text-arc-muted">
              No results found for "{debounced}".
            </div>
          ) : (
            <div className="py-14 text-center text-sm text-arc-muted">
              Start typing to search...
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
