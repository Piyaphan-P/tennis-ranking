import type { Period } from './types';

export type Lang = 'th' | 'en';

interface Strings {
  brand: string;
  subtitle: string;
  periods: Record<Period, string>;
  podiumTitle: string;
  tableTitle: string;
  avg: string;
  max: string;
  shots: string;
  shotsUnit: string;
  rank: string;
  updatedAt: string; // prefix, followed by HH:MM
  empty: string;
  emptySub: string;
  offlineTitle: string;
  offlineBody: string;
  retry: string;
  loading: string;
}

export const I18N: Record<Lang, Strings> = {
  th: {
    brand: 'ต้นและเพชร Tennis Club',
    subtitle: 'กระดานแชมป์ · LEADERBOARD',
    periods: { day: 'ประจำวัน', week: 'ประจำสัปดาห์', month: 'ประจำเดือน' },
    podiumTitle: 'โพเดียมแชมป์',
    tableTitle: 'อันดับทั้งหมด',
    avg: 'คะแนนเฉลี่ย',
    max: 'คะแนนสูงสุด',
    shots: 'จำนวนช็อต',
    shotsUnit: 'ช็อต',
    rank: 'อันดับ',
    updatedAt: 'อัปเดตล่าสุด',
    empty: 'ยังไม่มีผู้ท้าชิงวันนี้',
    emptySub: 'ลงคอร์ตเลย! ตีให้สุดแล้วมาครองอันดับ 1',
    offlineTitle: 'เชื่อมต่อกระดานแชมป์ไม่ได้',
    offlineBody:
      'ตอนนี้ยังดึงข้อมูลอันดับไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่',
    retry: 'ลองใหม่',
    loading: 'กำลังโหลดอันดับ…',
  },
  en: {
    brand: 'ต้นและเพชร Tennis Club',
    subtitle: 'CHAMPIONS BOARD · LEADERBOARD',
    periods: { day: 'Day', week: 'Week', month: 'Month' },
    podiumTitle: 'THE PODIUM',
    tableTitle: 'Full standings',
    avg: 'Avg score',
    max: 'Best score',
    shots: 'Shots',
    shotsUnit: 'shots',
    rank: 'Rank',
    updatedAt: 'Updated',
    empty: 'No challengers yet',
    emptySub: 'Hit the court — top the board!',
    offlineTitle: 'Leaderboard unavailable',
    offlineBody: "Can't load rankings right now. Please try again shortly.",
    retry: 'Retry',
    loading: 'Loading rankings…',
  },
};
