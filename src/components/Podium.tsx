import type { LeaderboardEntry } from '../types';
import type { Lang } from '../i18n';
import { I18N } from '../i18n';
import { fmtScore } from '../lib/format';

const MEDALS = ['🏆', '🥈', '🥉'];

function Col({ entry, lang }: { entry: LeaderboardEntry; lang: Lang }) {
  const t = I18N[lang];
  const cls = `podium-col p${entry.rank}`;
  return (
    <div className={cls}>
      <div className="podium-medal" aria-hidden>
        {MEDALS[entry.rank - 1]}
      </div>
      <div className="podium-name" title={entry.userName}>
        {entry.userName}
      </div>
      <div className="podium-score num">{fmtScore(entry.avgScore)}</div>
      <div className="podium-substat">
        {t.max} {fmtScore(entry.maxScore)} · {entry.shotCount} {t.shotsUnit}
      </div>
      <div className="podium-block">
        <span className="podium-block-num">{entry.rank}</span>
      </div>
    </div>
  );
}

/** Dramatic 2 | 1 | 3 podium for the top three (renders 1 or 2 if that's all). */
export function Podium({ top, lang }: { top: LeaderboardEntry[]; lang: Lang }) {
  const t = I18N[lang];
  const first = top.find((e) => e.rank === 1);
  const second = top.find((e) => e.rank === 2);
  const third = top.find((e) => e.rank === 3);
  return (
    <section className="podium-section">
      <h2 className="section-title">{t.podiumTitle}</h2>
      <div className="podium">
        <div>{second && <Col entry={second} lang={lang} />}</div>
        <div>{first && <Col entry={first} lang={lang} />}</div>
        <div>{third && <Col entry={third} lang={lang} />}</div>
      </div>
    </section>
  );
}
