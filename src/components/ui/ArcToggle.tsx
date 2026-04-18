import { motion } from "framer-motion";
import { useCursorHover } from "@/lib/cursor-context";

export function ArcToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  const cursor = useCursorHover("link");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      {...cursor}
      className="relative h-7 w-12 rounded-full border border-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arc-accent"
      style={{ background: checked ? "var(--arc-accent)" : "rgba(255,255,255,0.06)" }}
    >
      <motion.span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
