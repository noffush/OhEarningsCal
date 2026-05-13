import { readJSONIfExists } from '../lib/fs.js';
import { indexFile } from '../lib/paths.js';
import { processEarnings } from '../process/earnings.js';
import { writeIcsFile } from '../generate/ics.js';
import { fetchCpiEvents } from '../lib/fetch-cpi.js';
import { loadManualEvents } from '../lib/manual-events.js';
import { INDICES, CUSTOM_SLUG, SELECTED_SLUG, ALL_SLUG, MARKETCAP_TIERS } from '../config/indices.js';
import { env } from '../config/env.js';

async function loadIndex(slug) {
  const rows = await readJSONIfExists(indexFile(slug));
  if (!rows) {
    console.warn(`[gen] missing data/indices/${slug}.json — run 'npm run fetch:indices' first`);
    return [];
  }
  return rows;
}

async function buildCustomWatchlist(allIndexRows) {
  if (env.customStocks.length === 0) return null;
  const lookup = new Map(allIndexRows.map((r) => [r.symbol.toUpperCase(), r]));
  return env.customStocks.map((sym) => {
    const upper = sym.toUpperCase();
    const hit = lookup.get(upper);
    return hit ?? { symbol: upper, companyName: upper, industry: '' };
  });
}

function dedupeByKey(events) {
  const seen = new Set();
  const out = [];

  for (const event of events) {
    const key =
      event.uid ||
      (event.date && event.symbol
        ? `earnings:${event.symbol}:${event.date}`
        : `generic:${event.title}:${event.start}`);

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }

  return out;
}

function sortMergedEvents(events) {
  return [...events].sort((a, b) => {
    const aDate = a.date || a.start || '';
    const bDate = b.date || b.start || '';
    return aDate.localeCompare(bDate);
  });
}

async function buildMergedCustomEvents(watchlist) {
  const earningsEvents = await processEarnings({ watchlist });

  const [cpiEvents, manualEvents] = await Promise.all([
    fetchCpiEvents().catch((err) => {
      console.warn(`[gen] failed to fetch CPI events: ${err.message}`);
      return [];
    }),
    loadManualEvents().catch((err) => {
      console.warn(`[gen] failed to load manual events: ${err.message}`);
      return [];
    }),
  ]);

  const merged = dedupeByKey([
    ...earningsEvents,
    ...cpiEvents,
    ...manualEvents,
  ]);

  const sorted = sortMergedEvents(merged);

  console.log(
    `[gen] merged custom calendar: earnings=${earningsEvents.length}, cpi=${cpiEvents.length}, manual=${manualEvents.length}, total=${sorted.length}`,
  );

  return sorted;
}

async function genForList(slug, label, watchlist) {
  const events = await processEarnings({ watchlist });
  await writeIcsFile({ slug, label, events });
  return events;
}

async function main() {
  // 1. Load each index's constituents and write their ics.
  const allIndexRows = [];
  for (const meta of INDICES) {
    const rows = await loadIndex(meta.slug);
    allIndexRows.push(...rows);
    await genForList(meta.slug, meta.label, rows);
  }

  // 2. Custom watchlist (driven by CUSTOM_STOCKS env var) + CPI + manual FOMC.
  const customWatchlist = await buildCustomWatchlist(allIndexRows);
  if (customWatchlist) {
    const customEvents = await buildMergedCustomEvents(customWatchlist);
    await writeIcsFile({
      slug: CUSTOM_SLUG,
      label: 'Custom Watchlist',
      events: customEvents,
    });
  } else {
    console.log('[gen] CUSTOM_STOCKS not set — skipping customstock.ics');
  }

  // 3. selected = union of all indices + custom (de-dup by symbol).
  if (env.shouldGenSelected) {
    const seen = new Set();
    const selected = [];
    for (const r of [...allIndexRows, ...(customWatchlist ?? [])]) {
      const sym = r.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      seen.add(sym);
      selected.push(r);
    }
    await genForList(SELECTED_SLUG, 'Selected (Indices + Custom)', selected);
  }

  // 4. all + market-cap tiers — both derived from the unfiltered full set.
  //    Always compute the full set so tiers can be generated regardless of
  //    SHOULD_GEN_ALL; only the all.ics write is gated on the flag.
  const allEvents = await processEarnings({ watchlist: null });
  if (env.shouldGenAll) {
    await writeIcsFile({ slug: ALL_SLUG, label: 'All Earnings', events: allEvents });
  }
  for (const tier of MARKETCAP_TIERS) {
    const events = allEvents.filter(
      (e) => e.marketCapValue !== null && e.marketCapValue >= tier.min && e.marketCapValue < tier.max,
    );
    await writeIcsFile({ slug: tier.slug, label: tier.label, events });
  }

  console.log('[gen] done.');
}

await main();
