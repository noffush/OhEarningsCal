const BLS_ICS_URL = 'https://www.bls.gov/schedule/news_release/bls.ics';

function unescapeIcsText(value = '') {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
    .trim();
}

function unfoldIcsLines(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function parseDateValue(value) {
  const raw = (value || '').trim();

  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  if (/^\d{8}T\d{6}Z?$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    return `${year}-${month}-${day}`;
  }

  return null;
}

function addOneDay(dateStr) {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function parseIcsEvents(icsText) {
  const text = unfoldIcsLines(icsText);
  const chunks = text.split('BEGIN:VEVENT').slice(1);

  return chunks.map((chunk) => {
    const body = chunk.split('END:VEVENT')[0] || '';
    const lines = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const event = {};

    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;

      const left = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const [key, ...params] = left.split(';');
      const upperKey = key.toUpperCase();

      if (!event[upperKey]) event[upperKey] = [];
      event[upperKey].push({
        params,
        value: unescapeIcsText(value),
      });
    }

    return event;
  });
}

function getFirstValue(event, key) {
  return event[key]?.[0]?.value || '';
}

function isCpiEvent(summary = '', description = '') {
  const haystack = `${summary}\n${description}`.toLowerCase();

  return (
    haystack.includes('consumer price index') ||
    haystack.includes('cpi')
  );
}

function normalizeBlsEvent(event) {
  const summary = getFirstValue(event, 'SUMMARY');
  const description = getFirstValue(event, 'DESCRIPTION');
  const location = getFirstValue(event, 'LOCATION');
  const uid = getFirstValue(event, 'UID');

  const dtStartRaw = getFirstValue(event, 'DTSTART');
  const dtEndRaw = getFirstValue(event, 'DTEND');

  const start = parseDateValue(dtStartRaw);
  if (!start) return null;

  const end = parseDateValue(dtEndRaw) || addOneDay(start);

  return {
    uid: uid || `bls-cpi-${start}`,
    title: summary || 'US CPI',
    start,
    end,
    allDay: true,
    description: description || 'BLS Consumer Price Index release',
    location,
    source: 'bls-cpi',
  };
}

export async function fetchCpiEvents() {
  const response = await fetch(BLS_ICS_URL, {
    headers: {
      'user-agent': 'OhEarningsCal/merged-calendar',
      accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch BLS calendar: ${response.status} ${response.statusText}`);
  }

  const icsText = await response.text();
  const events = parseIcsEvents(icsText);

  return events
    .filter((event) => {
      const summary = getFirstValue(event, 'SUMMARY');
      const description = getFirstValue(event, 'DESCRIPTION');
      return isCpiEvent(summary, description);
    })
    .map(normalizeBlsEvent)
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export { BLS_ICS_URL };
