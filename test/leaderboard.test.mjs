// Tests for the pure ranking logic (server/leaderboard.mjs) — the exact code the
// server runs at request time. Lives outside src/ so tsc --noEmit (include:src)
// stays green while vitest still discovers it.
import { describe, it, expect } from 'vitest';
import {
  bangkokDayString,
  addDays,
  periodWindow,
  normalizeUserName,
  mergeRecords,
  rankEntries,
  mergeAndRank,
} from '../server/leaderboard.mjs';

describe('bangkokDayString', () => {
  it('formats a UTC instant into the Bangkok calendar day', () => {
    // 2026-07-08T05:00:00Z = 12:00 Bangkok → same day
    expect(bangkokDayString(new Date('2026-07-08T05:00:00Z'))).toBe('2026-07-08');
  });

  it('rolls to the NEXT Bangkok day for a late-UTC instant (UTC+7 boundary)', () => {
    // 2026-07-08T23:30:00Z = 06:30 Bangkok on 2026-07-09
    expect(bangkokDayString(new Date('2026-07-08T23:30:00Z'))).toBe('2026-07-09');
  });

  it('a 17:30Z instant is still the same Bangkok day (00:30 next day is boundary)', () => {
    // 2026-07-08T16:59:00Z = 23:59 Bangkok same day
    expect(bangkokDayString(new Date('2026-07-08T16:59:00Z'))).toBe('2026-07-08');
    // 2026-07-08T17:00:00Z = 00:00 Bangkok next day
    expect(bangkokDayString(new Date('2026-07-08T17:00:00Z'))).toBe('2026-07-09');
  });
});

describe('addDays / periodWindow', () => {
  it('adds and subtracts days without tz slippage', () => {
    expect(addDays('2026-07-08', -6)).toBe('2026-07-02');
    expect(addDays('2026-07-08', 0)).toBe('2026-07-08');
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30'); // month boundary
  });

  it('day window is today only', () => {
    expect(periodWindow('day', '2026-07-08')).toEqual({ from: '2026-07-08', to: '2026-07-08' });
  });

  it('week window is last 7 days inclusive', () => {
    expect(periodWindow('week', '2026-07-08')).toEqual({ from: '2026-07-02', to: '2026-07-08' });
  });

  it('month window is last 30 days inclusive and can span a month boundary', () => {
    expect(periodWindow('month', '2026-07-08')).toEqual({ from: '2026-06-09', to: '2026-07-08' });
  });

  it('throws on an unknown period', () => {
    expect(() => periodWindow('year', '2026-07-08')).toThrow();
  });
});

describe('normalizeUserName', () => {
  it('maps blank / whitespace / non-string to the anonymous bucket', () => {
    expect(normalizeUserName('')).toBe('ผู้เล่นนิรนาม');
    expect(normalizeUserName('   ')).toBe('ผู้เล่นนิรนาม');
    expect(normalizeUserName(null)).toBe('ผู้เล่นนิรนาม');
    expect(normalizeUserName('  เพชร ')).toBe('เพชร');
  });
});

describe('mergeRecords', () => {
  it('computes SHOT-WEIGHTED avg across a user\'s sessions (not mean of avgs)', () => {
    const merged = mergeRecords([
      { userName: 'ต้น', avgScore: 90, maxScore: 95, shotCount: 1 },
      { userName: 'ต้น', avgScore: 60, maxScore: 70, shotCount: 3 },
    ]);
    expect(merged).toHaveLength(1);
    // weighted = (90*1 + 60*3) / 4 = 270/4 = 67.5  (naive mean would be 75)
    expect(merged[0].avgScore).toBeCloseTo(67.5, 6);
    expect(merged[0].maxScore).toBe(95);
    expect(merged[0].shotCount).toBe(4);
  });

  it('groups blank names together under the anonymous bucket', () => {
    const merged = mergeRecords([
      { userName: '', avgScore: 50, maxScore: 60, shotCount: 2 },
      { userName: '  ', avgScore: 70, maxScore: 80, shotCount: 2 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].userName).toBe('ผู้เล่นนิรนาม');
    expect(merged[0].shotCount).toBe(4);
    expect(merged[0].avgScore).toBeCloseTo(60, 6);
  });

  it('ignores sessions with zero shots', () => {
    const merged = mergeRecords([
      { userName: 'ว่าง', avgScore: 0, maxScore: 0, shotCount: 0 },
    ]);
    expect(merged).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(mergeRecords([])).toEqual([]);
  });
});

describe('rankEntries', () => {
  it('ranks by avgScore desc and assigns 1-based ranks', () => {
    const ranked = rankEntries([
      { userName: 'a', avgScore: 70, maxScore: 80, shotCount: 5 },
      { userName: 'b', avgScore: 90, maxScore: 92, shotCount: 5 },
      { userName: 'c', avgScore: 80, maxScore: 85, shotCount: 5 },
    ]);
    expect(ranked.map((e) => e.userName)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('applies the full tie-break chain: avg → max → shotCount → name', () => {
    const ranked = rankEntries([
      { userName: 'same-avg-lo-max', avgScore: 80, maxScore: 85, shotCount: 10 },
      { userName: 'same-avg-hi-max', avgScore: 80, maxScore: 99, shotCount: 3 },
      { userName: 'same-avg-max-more-shots', avgScore: 80, maxScore: 85, shotCount: 20 },
    ]);
    expect(ranked.map((e) => e.userName)).toEqual([
      'same-avg-hi-max', // highest max wins first
      'same-avg-max-more-shots', // then more shots
      'same-avg-lo-max',
    ]);
  });

  it('filters out entries with fewer than 1 shot', () => {
    const ranked = rankEntries([
      { userName: 'has', avgScore: 50, maxScore: 60, shotCount: 1 },
      { userName: 'none', avgScore: 99, maxScore: 99, shotCount: 0 },
    ]);
    expect(ranked.map((e) => e.userName)).toEqual(['has']);
  });

  it('caps the board at 50 entries', () => {
    const many = Array.from({ length: 75 }, (_, i) => ({
      userName: `p${String(i).padStart(2, '0')}`,
      avgScore: i, // ascending so ranking reverses order
      maxScore: i,
      shotCount: 1,
    }));
    const ranked = rankEntries(many);
    expect(ranked).toHaveLength(50);
    expect(ranked[0].avgScore).toBe(74); // highest kept
  });
});

describe('mergeAndRank (end-to-end runtime path)', () => {
  it('merges sessions per user then ranks them', () => {
    const ranked = mergeAndRank([
      { userName: 'ต้น', avgScore: 90, maxScore: 95, shotCount: 2 },
      { userName: 'ต้น', avgScore: 80, maxScore: 88, shotCount: 2 },
      { userName: 'เพชร', avgScore: 88, maxScore: 90, shotCount: 4 },
    ]);
    // ต้น weighted avg = (90*2+80*2)/4 = 85 ; เพชร = 88 → เพชร first
    expect(ranked.map((e) => e.userName)).toEqual(['เพชร', 'ต้น']);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].avgScore).toBeCloseTo(85, 6);
  });

  it('returns [] for empty input', () => {
    expect(mergeAndRank([])).toEqual([]);
  });
});
