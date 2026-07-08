import { useCallback, useEffect, useState } from 'react';
import type { LeaderboardResponse, Period } from './types';
import { I18N, type Lang } from './i18n';
import { bangkokTime } from './lib/format';
import { Podium } from './components/Podium';
import { RankTable } from './components/RankTable';

const PERIODS: Period[] = ['day', 'week', 'month'];
const REFRESH_MS = 60_000;

export function App() {
  const [lang, setLang] = useState<Lang>('th');
  const [period, setPeriod] = useState<Period>('day');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const t = I18N[lang];

  const load = useCallback(async (p: Period) => {
    try {
      const res = await fetch(`/api/leaderboard?period=${p}`);
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as LeaderboardResponse;
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // (Re)load on period change + auto-refresh every 60s.
  useEffect(() => {
    setLoading(true);
    setData(null);
    load(period);
    const id = window.setInterval(() => load(period), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [period, load]);

  const entries = data?.entries ?? [];
  const top = entries.slice(0, 3);
  // Ranks 1-3 already shown on the podium; the table lists the rest. When there
  // are ≤3 players there's no podium overflow, so the table shows nothing extra.
  const rest = entries.slice(3);

  return (
    <div className="app">
      <header className="masthead">
        <span className="brand-dot" aria-hidden />
        <div className="masthead-titles">
          <span className="masthead-brand">{t.brand}</span>
          <span className="masthead-sub">{t.subtitle}</span>
        </div>
        <button
          className="lang-toggle"
          onClick={() => setLang((l) => (l === 'th' ? 'en' : 'th'))}
          aria-label="toggle language"
        >
          {lang === 'th' ? 'EN' : 'ไทย'}
        </button>
      </header>

      <div className="tabs" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={p === period}
            className={`tab${p === period ? ' active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {t.periods[p]}
          </button>
        ))}
      </div>

      <div className="statusline">
        {!error && data && (
          <>
            <span className="live-dot" aria-hidden />
            <span>
              {t.updatedAt} {bangkokTime(data.updatedAt)}
            </span>
          </>
        )}
        {loading && !data && <span>{t.loading}</span>}
      </div>

      {error ? (
        <div className="state-card">
          <div className="state-emoji" aria-hidden>
            📡
          </div>
          <div className="state-title">{t.offlineTitle}</div>
          <p className="state-body">{t.offlineBody}</p>
          <p className="state-body-bi">
            {lang === 'th' ? I18N.en.offlineBody : I18N.th.offlineBody}
          </p>
          <button className="btn" onClick={() => load(period)}>
            {t.retry}
          </button>
        </div>
      ) : entries.length === 0 && !loading ? (
        <div className="state-card">
          <div className="state-emoji" aria-hidden>
            🎾
          </div>
          <div className="state-title">{t.empty}</div>
          <p className="state-body">{t.emptySub}</p>
        </div>
      ) : (
        entries.length > 0 && (
          <>
            <Podium top={top} lang={lang} />
            {rest.length > 0 && <RankTable entries={rest} lang={lang} />}
          </>
        )
      )}
    </div>
  );
}
