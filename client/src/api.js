// ============================================================
// API client — all backend communication lives here.
// Includes offline cache + best-effort event queue.
// ============================================================

const BASE = '/api';
const CACHE_KEY = 'boston-runway-cache';
const EVENT_QUEUE_KEY = 'boston-runway-event-queue';

// ─── LocalStorage helpers ──────────────────────────────────
function cacheGet() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}
function cacheSet(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}
function queueGet() {
  try { return JSON.parse(localStorage.getItem(EVENT_QUEUE_KEY)) || []; } catch { return []; }
}
function queueSet(q) {
  try { localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(q)); } catch {}
}

// ─── Flush queued events (best-effort) ─────────────────────
async function flushEventQueue() {
  const q = queueGet();
  if (!q.length) return;
  const remaining = [];
  for (const evt of q) {
    try {
      await fetch(BASE + '/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evt),
      });
    } catch {
      remaining.push(evt);
    }
  }
  queueSet(remaining);
}

// ─── Core request helper ───────────────────────────────────
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
  bootstrap: async () => {
    try {
      const data = await req('GET', '/bootstrap');
      cacheSet(data);
      // Also flush any queued events now that we're online
      flushEventQueue().catch(() => {});
      return data;
    } catch (err) {
      const cached = cacheGet();
      if (cached) {
        cached._offline = true;
        return cached;
      }
      throw err;
    }
  },

  saveConfig: (config) => req('POST', '/config', config),

  logEvent: (type, data = {}) => {
    const evt = { type, data };
    // Best-effort: fire and forget, queue on failure
    return fetch(BASE + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evt),
    }).catch(() => {
      const q = queueGet();
      q.push(evt);
      queueSet(q);
    });
  },

  saveIntention: (date, data) => req('POST', '/intentions', { date, data }),

  saveReflection: (date, data) => req('POST', '/reflections', { date, data }),

  sendChat: (content) => req('POST', '/chat', { content }),

  clearChat: () => req('DELETE', '/chat'),

  generateInsight: () => req('POST', '/insights/generate'),

  weather: (lat, lon) => req('GET', `/weather?lat=${lat}&lon=${lon}`),

  dailyPraise: () => req('GET', '/daily-praise'),

  // Push notifications
  getVapidKey: () => req('GET', '/push/vapid-key'),
  subscribePush: (subscription) => req('POST', '/push/subscribe', subscription),

  // ElevenLabs Speech-to-Text — sends audio blob, returns { text }
  stt: async (audioBlob) => {
    const r = await fetch(BASE + '/stt', {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
    });
    if (!r.ok) {
      let errText = `HTTP ${r.status}`;
      try { const j = await r.json(); errText = j.error || errText; } catch {}
      throw new Error(errText);
    }
    return r.json();
  },

  // ElevenLabs TTS — returns audio blob
  tts: async (text) => {
    const r = await fetch(BASE + '/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      let errText = `HTTP ${r.status}`;
      try { const j = await r.json(); errText = j.error || errText; } catch {}
      throw new Error(errText);
    }
    return r.blob();
  },
};

// Date formatting helpers
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}-${d}-${y}`;
};

export const fmtLongDate = (iso) => {
  if (!iso) return '';
  const dt = new Date(iso + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
