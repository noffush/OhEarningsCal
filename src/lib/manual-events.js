import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function addOneDay(dateStr) {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export async function loadManualEvents() {
  const filePath = path.join(__dirname, '../../data/manual-events.json');

  try {
    const raw = await readFile(filePath, 'utf8');
    const events = JSON.parse(raw);

    console.log('[manual-events] loaded raw events:', events);
    
    return events
      .map((event) => {
        const start = event.start;
        const end = event.end || (event.allDay !== false ? addOneDay(start) : start);
        const uid =
          event.uid ||
          `manual-${event.title.toLowerCase().replace(/\s+/g, '-')}-${start}`;

        return {
          uid,
          title: event.title,
          start,
          end,
          allDay: event.allDay !== false,
          description: event.description || '',
          location: event.location || '',
          source: 'manual',
        };
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[manual-events] no manual events file found, skipping.');
      return [];
    }
    throw err;
  }
}
