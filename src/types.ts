export type Period = 'day' | 'week' | 'month';

export interface LeaderboardEntry {
  rank: number;
  userName: string;
  avgScore: number;
  maxScore: number;
  shotCount: number;
}

export interface LeaderboardResponse {
  period: Period;
  updatedAt: string; // ISO
  entries: LeaderboardEntry[];
}
