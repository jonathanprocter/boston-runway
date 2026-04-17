// ============================================================
// API client — all backend communication lives here.
// Replaces the window.storage calls from v2.
// ============================================================

const BASE = '/api';

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + path, opts);
  if (!r.ok) {
    let errText = `HTTP ${r.status}`;
    try { const j = await r.json(); errText = j.error || errText; } catch {}
    throw new Error(errText);
  }
  return r.json();
}

export const api = {
  bootstrap: () => req('GET', '/bootstrap'),

  saveConfig: (config) => req('POST', '/config', config),

  logEvent: (type, data = {}) => req('POST', '/events', { type, data }),

  saveIntention: (date, data) => req('POST', '/intentions', { date, data }),

  saveReflection: (date, data) => req('POST', '/reflections', { date, data }),

  sendChat: (content) => req('POST', '/chat', { content }),

  clearChat: () => req('DELETE', '/chat'),

  generateInsight: () => req('POST', '/insights/generate'),

  weather: (lat, lon) => req('GET', `/weather?lat=${lat}&lon=${lon}`),

  dailyPraise: () => req('GET', '/daily-praise'),
};

// Date formatting helpers
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}-${d}-${y}`;
};

export const fmtDateTime = (iso) => {
  if (!iso) return '';
  const dt = new Date(iso);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const time = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${mm}-${dd}-${yyyy} · ${time}`;
};
