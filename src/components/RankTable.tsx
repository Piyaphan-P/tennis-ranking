import type { LeaderboardEntry } from '../types';
import type { Lang } from '../i18n';
import { I18N } from '../i18n';
import { fmtScore } from '../lib/format';

/** Standings list. Shows every rank passed in (App decides where the podium ends). */
export function RankTable({ entries, lang }: { entries: LeaderboardEntry[]; lang: Lang }) {
  const t = I18N[lang];
  if (entries.length === 0) return null;
  return (
    <section className="board">
      <h2 className="section-title">{t.tableTitle}</h2>
      <div className="board-head">
        <span>#</span>
        <span>{lang === 'th' ? 'ผู้เล่น' : 'Player'}</span>
        <span className="col-num">{t.avg}</span>
        <span className="col-num">{t.max}</span>
      </div>
      <div className="board-list">
        {entries.map((e) => (
          <div key={e.userName} className={`rank-row${e.rank <= 3 ? ` top${e.rank}` : ''}`}>
            <span className="rank-num num">{e.rank}</span>
            <span className="rank-name" title={e.userName}>
              {e.userName}
            </span>
            <span className="rank-avg num">
              <span className="v">{fmtScore(e.avgScore)}</span>
              <span className="k">{t.avg}</span>
            </span>
            <span className="rank-max num">
              <span className="v">{fmtScore(e.maxScore)}</span>
              <span className="k">{t.max}</span>
            </span>
            <span className="rank-meta num">
              {e.shotCount} {t.shotsUnit}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
