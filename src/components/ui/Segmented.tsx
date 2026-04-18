import { motion } from "framer-motion";
import { useCursorHover } from "@/lib/cursor-context";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  const cursor = useCursorHover("link");
  return (
    <div className="relative inline-flex rounded-full border border-white/10 bg-white/5 p-1">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            {...cursor}
            className="relative px-4 py-1.5 text-xs font-medium tracking-wide focus-visible:outline-none"
            style={{ color: active ? "var(--arc-void)" : "var(--arc-text)" }}
          >
            {active && (
              <motion.span
                layoutId="seg-indicator"
                className="absolute inset-0 rounded-full bg-arc-accent"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
