import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { MovieCard } from "@/components/cards/MovieCard";
import { ACCLAIMED, BECAUSE_DUNE, NEW_ON_ARC } from "@/data/catalog";
import { useCursorHover } from "@/lib/cursor-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/my-list")({
  head: () => ({
    meta: [
      { title: "My List — ARC" },
      { name: "description", content: "Your saved films and series on ARC." },
      { property: "og:title", content: "My List — ARC" },
      { property: "og:description", content: "Your saved films and series on ARC." },
    ],
  }),
  component: MyListPage,
});

const FILTERS = ["All", "Movies", "Series", "Watchlisted", "Downloaded"] as const;
type Filter = (typeof FILTERS)[number];

function MyListPage() {
  const initial = [...ACCLAIMED.slice(0, 5), ...BECAUSE_DUNE.slice(0, 4), ...NEW_ON_ARC.slice(0, 3)];
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("All");
  const cursor = useCursorHover("link");

  const remove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-28 pb-20">
        <div className="mx-auto max-w-7xl px-[5vw]">
          <div className="mb-2 flex items-baseline justify-between">
            <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">My List</h1>
            <span className="label-caps text-arc-muted">{items.length} items</span>
          </div>
          <p className="text-sm text-arc-muted">Your collected stories — ready when you are.</p>

          <div className="mt-8 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                {...cursor}
                onClick={() => setFilter(f)}
                className="relative rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium tracking-wide focus-visible:outline-none"
                style={{ color: filter === f ? "var(--arc-void)" : "var(--arc-text)" }}
              >
                {filter === f && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-full bg-arc-accent"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative z-10">{f}</span>
              </button>
            ))}
          </div>

          <div className="mt-10">
            {items.length === 0 ? (
              <EmptyState />
            ) : (
              <motion.div
                layout
                className={cn(
                  "grid gap-4",
                  "[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]",
                  "md:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]",
                )}
              >
                <AnimatePresence>
                  {items.map((t) => (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3 }}
                    >
                      <MovieCard title={t} width={undefined as unknown as number} onRemove={() => remove(t.id)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-8">
        <div className="h-32 w-32 rounded-full border border-white/10 bg-gradient-to-br from-white/5 to-transparent" />
        <div
          className="absolute inset-3 rounded-full"
          style={{ background: "conic-gradient(var(--arc-accent), transparent 60%)", opacity: 0.5, filter: "blur(20px)" }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-3xl text-arc-text/50">＋</div>
      </div>
      <h2 className="font-display text-3xl font-extrabold tracking-tight">Your list is empty</h2>
      <p className="mt-3 max-w-sm text-sm text-arc-muted">
        Save films, series, and shorts you want to come back to. They'll all live here, organized your way.
      </p>
      <Link
        to="/browse"
        className="mt-6 inline-flex items-center justify-center rounded-full bg-arc-accent px-5 py-2.5 text-sm font-medium text-arc-void transition hover:bg-arc-accent/90"
      >
        Browse ARC
      </Link>
    </div>
  );
}
