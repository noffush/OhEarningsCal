// src/lib/manual-events.js

const fs = require('fs').promises;
const path = require('path');

function addOneDay(dateStr) {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

async function loadManualEvents() {
  const filePath = path.join(__dirname, '../../data/manual-events.json');
  
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const events = JSON.parse(raw);

    return events.map((event) => {
      const start = event.start;
      const end = event.end || (event.allDay ? addOneDay(start) : start);
      const uid = event.uid || `manual-${event.title.toLowerCase().replace(/\s+/g, '-')}-${start}`;

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
    }).sort((a, b) => a.start.localeCompare(b.start));

  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No manual events file found, skipping.');
      return [];
    }
    throw err;
  }
}

module.exports = {
  loadManualEvents,
};
