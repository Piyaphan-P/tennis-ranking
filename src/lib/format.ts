/** Format a score for display: 1 decimal, tabular-friendly. */
export function fmtScore(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return n.toFixed(1);
}

/** HH:MM in Asia/Bangkok time for an ISO timestamp (the "อัปเดตล่าสุด" stamp). */
export function bangkokTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
