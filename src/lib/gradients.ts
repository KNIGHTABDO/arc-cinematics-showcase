// Deterministic, cinematic gradient placeholders — no images needed.
const PALETTE: Array<[string, string, string]> = [
  ["#1a0b2e", "#4a0e4e", "#82368c"],
  ["#0f2027", "#203a43", "#2c5364"],
  ["#3a1c71", "#d76d77", "#ffaf7b"],
  ["#000428", "#004e92", "#1f3a5f"],
  ["#232526", "#414345", "#5d4037"],
  ["#16222a", "#3a6073", "#16222a"],
  ["#2c0838", "#5b1d6b", "#2c0838"],
  ["#1f1c2c", "#928dab", "#1f1c2c"],
  ["#0a0a23", "#191970", "#4b0082"],
  ["#2d1b4e", "#7e2553", "#1a0b2e"],
  ["#1c1c1c", "#3d2c8d", "#0a0a0a"],
  ["#0d1b2a", "#1b263b", "#415a77"],
  ["#2b0a3d", "#560a86", "#180029"],
  ["#1a1a2e", "#16213e", "#0f3460"],
  ["#3e1f47", "#1f1147", "#0e0a2e"],
  ["#1f1f1f", "#5e2750", "#1f1f1f"],
];

export function gradientFor(seed: string | number, angle = 135): string {
  const s =
    typeof seed === "number" ? seed : seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const [a, b, c] = PALETTE[s % PALETTE.length];
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 55%, ${c} 100%)`;
}

export function avatarGradient(seed: string): string {
  const s = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hues = [
    "linear-gradient(135deg, #c084fc 0%, #f472b6 100%)",
    "linear-gradient(135deg, #60a5fa 0%, #c084fc 100%)",
    "linear-gradient(135deg, #f472b6 0%, #fb923c 100%)",
    "linear-gradient(135deg, #34d399 0%, #60a5fa 100%)",
    "linear-gradient(135deg, #fbbf24 0%, #f472b6 100%)",
    "linear-gradient(135deg, #a78bfa 0%, #38bdf8 100%)",
  ];
  return hues[s % hues.length];
}
