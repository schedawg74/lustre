export const formatTime = (epochMs: number) =>
  new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const RELATIVE_STEPS = [
  { ms: 86_400_000, unit: "day" },
  { ms: 3_600_000, unit: "hour" },
  { ms: 60_000, unit: "minute" },
] as const;

export const formatAgo = (epochMs: number, now: number) => {
  const elapsed = now - epochMs;
  const format = new Intl.RelativeTimeFormat([], { numeric: "auto" });
  for (const step of RELATIVE_STEPS) {
    if (elapsed >= step.ms) {
      return format.format(-Math.floor(elapsed / step.ms), step.unit);
    }
  }
  return "just now";
};

/** "2116659176894071283" becomes "2116…1283". */
export const shortId = (id: string) =>
  id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;

export const formatCount = (value: number) =>
  new Intl.NumberFormat().format(value);
