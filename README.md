# BoE Auction Scanner

A static website, hosted on GitHub Pages, that scans **every auction house in a World of Warcraft region** for the
**current season's Bind-on-Equip raid gear** and lets you find the cheapest listing that matches exactly what you
want: item, item level / difficulty, socket, secondary stats (with *any / all / exactly* matching and a "major stat"
option), tertiary stat, maximum buyout and realm. Any listing can then be **verified in real time** against Blizzard's
API straight from the browser.

Everything runs on GitHub: a GitHub Actions workflow scans the auction houses every 30 minutes and deploys the site
plus fresh data to GitHub Pages. There is no server to maintain.

## How it works

```
GitHub Actions (every 30 min)                         GitHub Pages (static)
┌──────────────────────────────────────┐              ┌──────────────────────────────────┐
│ 1. build the site (Vite + React)     │   deploy     │ index.html + JS/CSS              │
│ 2. scanner: Blizzard API ──────────┐ │ ───────────▶ │ data/index.json                  │
│    • every connected realm         │ │              │ data/<region>.json  (listings)   │
│    • keep season BoEs w/ buyout    │ │              │ data/bonuses.json   (bonus ids)  │
│    • skip realms unchanged (304)   │ │              └──────────────────────────────────┘
│ 3. upload dist/ as Pages artifact  ◀─┘                        │
└──────────────────────────────────────┘                        ▼
                                                     Browser: filters + sorting run locally.
                                                     "Verify" re-downloads one realm's auction
                                                     house from Blizzard with your own API
                                                     credentials (stored only in your browser).
```

* `src/shared/` – season configuration, bonus-id decoding (item level, upgrade track, socket, tertiary, secondaries) and the filter logic. Used by both the scanner and the site.
* `src/scanner/` – Node script run by the workflow. Fetches the connected-realm list, downloads each realm's auction dump in parallel, keeps only the season's BoEs that have a buyout, and writes compact JSON.
* `src/web/` – the React site.
* `.github/workflows/scan-and-deploy.yml` – the cron + deploy workflow.

## Setup (one time)

1. **Create a Blizzard API client** at <https://develop.battle.net/access/clients> (any name; no redirect URL is
   needed). Note the *Client ID* and *Client Secret*.
2. **Add repository secrets** (Settings → Secrets and variables → Actions → *Secrets*):
   * `BLIZZARD_CLIENT_ID`
   * `BLIZZARD_CLIENT_SECRET`
3. *(Optional)* **Repository variables** (same page, *Variables* tab):
   * `REGIONS` – comma separated regions to scan, default `us,eu` (supported: `us`, `eu`, `kr`, `tw`). Each extra region adds a few minutes per run.
   * `SCAN_CONCURRENCY` – parallel realm downloads, default `6`.
4. **Enable GitHub Pages with the "GitHub Actions" source**: Settings → Pages → *Build and deployment* → Source:
   **GitHub Actions**. (The workflow also tries to enable this automatically on its first run.)
5. **Get this code onto the repository's default branch** (scheduled workflows only run there, and pushes deploy only
   from there) and run the workflow once by hand: Actions → *Scan auctions and deploy* → *Run workflow*. After it
   finishes the site is at `https://<your-user>.github.io/<repo>/`.

From then on the workflow runs every 30 minutes. Notes:

* Blizzard refreshes each realm's auction-house snapshot roughly **once per hour**, so a 30-minute cadence picks up
  every new snapshot with at most ~30 minutes delay. To change the cadence edit the `cron:` line in the workflow
  (GitHub's minimum is 5 minutes, and scheduled runs are often delayed by a few minutes when GitHub is busy).
* Public repositories get unlimited Actions minutes. A private repository's free quota (2,000 min/month) is **not**
  enough for a 30-minute schedule; use a public repo or a longer interval.
* GitHub automatically disables scheduled workflows in repositories that have had **no commits for 60 days**. Any
  push re-enables them (or re-enable under Actions).
* If a scan cannot download some realms it re-uses those realms' data from the previous deploy and marks them
  *stale* in the UI; if Blizzard's API is down entirely the workflow fails and the previous deployment stays live.

## Using the site

* **Items** – tick the BoEs you care about (grouped by armour type; "only" limits to one group). Counts next to each
  item show how many listings match your other filters.
* **Item level** – difficulty chips select whole upgrade tracks (LFR = Veteran, Normal = Champion, Heroic = Hero,
  Mythic = Myth) and can be combined; min/max item level gives fine control (upgraded items are decoded to their
  actual item level, e.g. Hero 3/6 = 311).
* **Secondary stats** – pick stats and choose how they must match:
  * *Any of* – the item has at least one of the selected stats ("rings that have crit on them").
  * *All of* – every selected stat is on the item ("rings with crit **and** haste").
  * *Exactly* – the item's stats are precisely the selection and nothing else ("rings with **just** crit").
  * *Major stat* – additionally require a stat to be the item's **major** secondary (the one with the larger
    budget; it is listed first in the table). Raid BoEs always carry two secondaries, so "Exactly: Crit" alone only
    matches single-stat items; use *Major stat = Crit* for "crit-focused" items.
* **Tertiary** – Leech / Avoidance / Speed / Indestructible, plus *None* for items without one. Multiple selections
  mean "any of these".
* **Socket**, **Max buyout** (gold), **Realms** (multi-select) and column sorting work as you would expect. Filters are
  written to the URL, so a filtered view can be bookmarked or shared, and are remembered between visits.
* Hover an item name for the **Wowhead tooltip** of that exact variant.

### Real-time verification

The table shows the state of the last scan. Click **Verify** on a listing to re-download that realm's auction house
from Blizzard right now, in your browser. The site reports whether the listing is still there (and refreshes every
season BoE listing of that realm while it is at it).

This needs Blizzard API credentials because Blizzard requires an OAuth token for every request: click **⚙ Set up
verification** and paste the same Client ID / Secret you created above. They are stored only in that browser's
`localStorage` and are sent only to Blizzard's OAuth and Game Data endpoints (both allow browser requests). Anyone
with the credentials could use your API quota, so do not share them and do not enter them on a shared computer;
you can revoke them at any time in the Blizzard developer portal or with **Forget credentials**.

"Verified" means "present in Blizzard's most recent snapshot for that realm", which can itself be up to an hour old.

## Local development

```bash
npm install
npm run mock-data     # writes sample data to public/data so the site works without API access
npm run dev           # http://localhost:5173
npm test              # unit tests (decoding, filters, scanner pipeline with a fake API)
npm run typecheck
```

To run a real scan locally, copy `.env.example` to `.env`, fill in the credentials and run
`npm run scan` (`--regions eu`, `--out dir`, `--concurrency N`, `--previous <url-or-dir>` and `--offline-bonuses`
are optional). The result lands in `public/data` and is picked up by `npm run dev`.

## Updating for a new season

Only the items in `src/shared/season.ts` are scanned. When a new raid tier starts:

1. Find the new BoE item ids (Wowhead's item search filtered by *Binds when equipped* + the new raid, or
   `npm run season:discover` which lists raid-context items on the auction houses that are not in the current list).
2. `npm run season:lookup -- <id> <id> ...` prints ready-to-paste entries (name, slot, icon, base item level).
3. Update `id`, `name`, `raid`, `patch`, `squishEra` and the `difficulties` table (the upgrade-track names and the item
   level each difficulty drops at) in `season.ts`, paste the items, and commit. The next scan uses the new list.

`src/shared/vendor/bonuses.compact.json` is an offline copy of Raidbots' bonus-id table used when raidbots.com is
unreachable during a scan; refresh it occasionally with `npm run bonuses:vendor`.

## Acknowledgements

Inspired by [WoWPay2Win](https://github.com/Trinovantes/WoWPay2Win). Item bonus data comes from
[Raidbots](https://www.raidbots.com/); tooltips and icons from [Wowhead](https://www.wowhead.com/). Not affiliated
with Blizzard Entertainment.
