# ADGE Tennis — Leaderboard (Ranking App) UI Design Brief for Google Stitch

> Paste any section below into **Google Stitch** (stitch.withgoogle.com) to generate
> matching mobile UI. This describes the ACTUAL ranking app (separate sibling repo of
> the ADGE Tennis coach app), grounded in its real `src/theme.css`, `i18n.ts`, and
> components. Real Thai UI labels are kept in parentheses next to the English so Stitch
> names things correctly. **Design for mobile portrait first**; the vibe is an **ATP
> tour-finals TV leaderboard**. TH is primary; EN is a one-tap toggle.

---

## 1. Product one-liner + brand

**ADGE Tennis — Champions Board (กระดานแชมป์)** is a standalone read-only
**leaderboard web app** for the ADGE Tennis club. It shows who is winning today, this
week, and this month: a dramatic 3-person **podium** (🏆🥈🥉) on top, then a full
standings table below. Each player is ranked by **average score**, with **best (max)
score** and **shot count** as supporting stats. Day/week/month windows use **Bangkok
day boundaries**. It reuses the coach app's court-night design tokens but dials them up
to broadcast energy — big display names, gold glow on #1, an animated podium reveal.

- **Brand name:** ADGE Tennis (exact spelling), tagline "กระดานแชมป์ · LEADERBOARD" / "CHAMPIONS BOARD · LEADERBOARD".
- **Purpose:** a single-page, auto-refreshing leaderboard (polls every 60s). No login, no interaction beyond period tabs + language toggle — it's a scoreboard you glance at.
- **Language:** Thai primary, English via a compact toggle button (EN ⇄ ไทย).
- **Platform:** mobile web, portrait, phone-sized (content max-width ~560px, centered on desktop). Respects `prefers-reduced-motion`.
- **Mood:** premium ATP-finals broadcast graphics at night — dark, confident, gold-and-optic-yellow, names are the stars.

---

## 2. Visual language (exact tokens)

### Color palette (dark broadcast theme — no light mode)

| Role | Hex | Use |
|---|---|---|
| Background (`--bg`) | `#0a1113` | near-black teal base |
| **Backdrop glow** | court-blue `rgba(79,192,230,0.14)` + gold `rgba(255,210,63,0.08)` radial gradients | fixed radial glows from the top of the screen — a stadium-lights feel over `--bg` |
| Surface (`--surface`) | `#0e181a` | cards, rank rows, tabs track |
| Surface-2 (`--surface-2`) | `#12211f` | podium block gradient top |
| Hairline (`--line`) | `rgba(255,255,255,0.12)` | 1px borders/dividers |
| Strong line (`--line-strong`) | `rgba(255,255,255,0.22)` | dashed empty-state border, block numerals |
| **Accent (`--accent`)** | `#d6f441` | **optic tennis-ball yellow** — active tab, avg-score numbers, brand dot |
| Accent ink (`--accent-ink`) | `#0a1113` | dark text ON the yellow accent |
| Court blue (`--court-blue`) | `#4fc0e6` | subtitle "CHAMPIONS BOARD", backdrop glow |
| **Gold (`--gold`)** | `#ffd23f` | #1 champion — name, medal glow, podium block |
| Gold deep (`--gold-deep`) | `#e8a613` | #1 block gradient bottom |
| **Silver (`--silver`)** | `#d6e0e6` | #2 name |
| **Bronze (`--bronze`)** | `#e08a4b` | #3 name |
| Good (`--good`) | `#39d08a` | the pulsing "live" status dot |
| Text (`--text`) | `#f2f6f4` | primary near-white |
| Text dim (`--text-dim`) | `#9fb0ad` | secondary/muted |
| Text faint (`--text-faint`) | `#63736f` | section titles, small labels |

### Typography

- **Display font** (headings, names, tabs, brand): system sans stack (`-apple-system, 'Segoe UI', system-ui, 'Noto Sans Thai'`). Weight **800–900**, letter-spacing `-0.02em`, tight line-height.
- **Player names are the STAR** — deliberately large: table rank names at **1.35rem/800**, #1 podium name **1.5rem** in gold with a soft glow.
- **Mono / numbers:** `ui-monospace, 'SF Mono', 'JetBrains Mono', 'Roboto Mono'` with **tabular numerals** — every score and count is a scoreboard number.
- **Section titles** are tiny, uppercase, wide-tracked (0.2em) faint labels (e.g. "THE PODIUM", "FULL STANDINGS").
- **Subtitle** ("CHAMPIONS BOARD · LEADERBOARD") is court-blue, 0.68rem, wide-tracked 0.18em.

### Spacing / radius / elevation / motion

- Spacing scale 4/8/12/16/24/32/48px. Radii: small 8, default 14, large 22, pill 999.
- Shadows: soft `0 1px 2px rgba(0,0,0,.4)`, deep `0 8px 28px rgba(0,0,0,.5)`. #1 podium adds a gold glow `0 -2px 30px rgba(255,210,63,.3)`.
- **Motion (signature):** the podium columns **rise up + fade in** staggered (#2 first, then #1, then #3) on load; #1's block has a slow **gold shimmer** sweep; standings rows fade-up in sequence; the live status dot **blinks** (2s). All motion disables under `prefers-reduced-motion`.

---

## 3. Global patterns

- **Single scrolling page** (no bottom nav) inside a max-560px centered column, padded for safe areas.
- **Masthead** at top: glowing yellow brand dot + "ADGE Tennis" wordmark with the court-blue tracked subtitle beneath; a pill **language toggle** (EN / ไทย) pushed to the far right.
- **Period tabs** = a big pill-shaped segmented control, 3 equal segments **ประจำวัน (Day) / ประจำสัปดาห์ (Week) / ประจำเดือน (Month)**; the active segment is filled optic-yellow with dark text and a yellow glow.
- **Status line** under the tabs: a green pulsing **live dot** + "อัปเดตล่าสุด HH:MM (Updated HH:MM)" (Bangkok time), or "กำลังโหลดอันดับ… (Loading rankings…)".
- **Cards / rows:** surface fill, 1px hairline border, 14px radius. Top-3 rows that spill into the table get a **medal-tinted border** (gold/silver/bronze).
- **Numbers are mono + tabular** everywhere. Scores render to one convention via `fmtScore` (e.g. whole numbers like "87").
- **Medal system:** 🏆 = #1 gold, 🥈 = #2 silver, 🥉 = #3 bronze — colors carry through names, medals, block numerals, and row accents.

---

## 4. Screen-by-screen specs

This app is essentially **one screen** with three states (populated / empty / offline). Below is the main populated layout, then the two states.

### 4.1 Leaderboard (main screen) — populated

**Layout (top → bottom):**
1. **Masthead:** brand dot + "ADGE Tennis" + subtitle "กระดานแชมป์ · LEADERBOARD"; language toggle top-right.
2. **Period tabs:** pill segmented — ประจำวัน / ประจำสัปดาห์ / ประจำเดือน (Day/Week/Month); active = yellow.
3. **Status line:** green pulsing live dot + "อัปเดตล่าสุด 14:32".
4. **THE PODIUM (โพเดียมแชมป์):** the dramatic hero. A 3-column grid arranged **2 | 1 | 3** aligned to the bottom, standing on physical **podium blocks** of different heights (#1 tallest ~132px gold-glowing, #2 ~96px silver-edged, #3 ~72px bronze-edged, each with a big faded rank numeral on the block). Above each block: a **medal emoji** (🏆 bigger for #1), the **player name** (huge, gold/silver/bronze colored, #1 has a gold glow), the **average score** in big mono (accent-yellow for #1), and a substat line "คะแนนสูงสุด NN · NN ช็อต (Best NN · NN shots)". Columns rise+fade in on load; #1 shimmers gold.
5. **FULL STANDINGS (อันดับทั้งหมด):** a table listing ranks 4..N (and 1..3 too if there are ≤3 players and no podium overflow). Column header row: **# · ผู้เล่น (Player) · คะแนนเฉลี่ย (Avg) · คะแนนสูงสุด (Max)**. Each row: mono **rank number**, a **BIG player name** (1.35rem, the star), a stacked **avg score** (big yellow value + tiny "AVG SCORE" label), a stacked **max score** (white value + "BEST" label), and a second-line meta "NN ช็อต (NN shots)". Top-3 rows (when present here) get medal-tinted borders/numbers. Rows fade-up in sequence.

**Primary actions:** switching period tabs (reloads data); language toggle. Auto-refreshes every 60s.

**Stitch prompt:** _A dark premium ATP-broadcast tennis leaderboard, mobile portrait. Background is near-black teal (#0a1113) with subtle blue and gold radial glows from the top like stadium lights. Top masthead: a glowing optic-yellow dot + "ADGE Tennis" wordmark and a small court-blue wide-tracked subtitle "CHAMPIONS BOARD · LEADERBOARD", with a pill language toggle top-right. Below, a big pill segmented control with three tabs "Day / Week / Month" (active tab filled optic-yellow #d6f441 with a soft glow). A status line with a small pulsing green dot and "Updated 14:32". The hero is a 3-person PODIUM arranged 2 | 1 | 3 standing on blocks of different heights — #1 tallest with a gold-glowing block (#ffd23f), #2 silver, #3 bronze — each topped by a medal emoji (🏆🥈🥉), a large player name colored gold/silver/bronze, a big mono average score, and a "Best 92 · 40 shots" substat. Under the podium, a "Full standings" table of rows: mono rank number, a large bold player name, a stacked avg score (big yellow) and best score, and a "shots" meta line. Mono tabular numbers throughout, weight-800 display type, letter-spacing tight. Elegant, confident, scoreboard energy._

---

### 4.2 Empty state (no challengers yet)

Shown when the selected period has zero players. A centered dashed-border card:
- Big 🎾 emoji.
- Title "ยังไม่มีผู้ท้าชิงวันนี้ (No challengers yet)".
- Body "ลงคอร์ตเลย! ตีให้สุดแล้วมาครองอันดับ 1 (Hit the court — top the board!)".

**Stitch prompt:** _A dark centered empty-state card with a dashed subtle border on a near-black teal background: a large tennis-ball emoji, a bold title "No challengers yet", and an encouraging line "Hit the court — top the board!". Optic-yellow and gold accent palette, mobile portrait._

---

### 4.3 Offline / error state

Shown when the leaderboard API can't be reached. Centered dashed card:
- Big 📡 emoji.
- Title "เชื่อมต่อกระดานแชมป์ไม่ได้ (Leaderboard unavailable)".
- Body (bilingual — shows both TH and EN lines) "ตอนนี้ยังดึงข้อมูลอันดับไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่ / Can't load rankings right now. Please try again shortly."
- A yellow pill **"ลองใหม่ (Retry)"** button.

**Stitch prompt:** _A dark centered error-state card with a dashed border: a satellite-dish emoji 📡, a bold title "Leaderboard unavailable", a two-line bilingual body, and a full-width optic-yellow pill "Retry" button. Near-black teal background, mobile portrait._

---

## 5. Component reference (for consistent generation)

- **Masthead** — brand dot (16px, glowing yellow) + wordmark + court-blue tracked subtitle + right-aligned pill language toggle.
- **Period tabs** — pill segmented, 3 equal buttons, active = yellow fill + glow.
- **Status line** — pulsing green live dot + mono "Updated HH:MM" (Bangkok).
- **Podium** — the 2|1|3 hero: medal, name (medal-colored), avg score (mono), substat (best + shots), and a standing block sized by rank with a big faded rank numeral; staggered rise-in animation, gold shimmer on #1.
- **RankTable** — header row (# / Player / Avg / Max) + rank rows with big names and stacked avg/max stat pairs + a shots meta line; medal-tinted top-3 rows; fade-up rows.
- **State cards** — empty (🎾) and offline (📡), dashed border, centered, with retry on offline.

---

## Appendix — quick reference for Stitch

- **Always dark broadcast theme.** bg `#0a1113` with blue+gold radial top glows; cards/rows `#0e181a` with 1px `rgba(255,255,255,0.12)` borders, 14px radius.
- **Accents:** optic-yellow `#d6f441` (active tab, avg scores), court-blue `#4fc0e6` (subtitle). **Medals:** gold `#ffd23f`, silver `#d6e0e6`, bronze `#e08a4b`.
- **Player names are the star** — large weight-800 display type; #1 name in glowing gold.
- **All scores/counts** in a mono tabular font — scoreboard feel.
- **Podium 2 | 1 | 3** with tiered block heights, medals 🏆🥈🥉, staggered rise-in reveal, gold shimmer on #1.
- **Mobile portrait**, max width ~560px, big pill tabs, one glanceable scrolling page, auto-refresh feel (a subtle live dot).
- **Bilingual**, Thai primary — small EN/ไทย toggle top-right. Ranks by **average score**, with **max score** + **shot count** as supporting stats; **Day / Week / Month** (Bangkok boundaries).
