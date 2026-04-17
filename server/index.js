// ============================================================
// Boston Runway — Backend server
// Node.js + Express + Postgres + Anthropic API + Open-Meteo
// ============================================================

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
const DATABASE_URL = process.env.DATABASE_URL;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '1SM7GgM6IMuvQlz2BwM3';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:jonathan@jonathanprocter.com';

if (!ANTHROPIC_API_KEY) console.warn('⚠️  ANTHROPIC_API_KEY not set — Claude features will fail');
if (!DATABASE_URL) console.warn('⚠️  DATABASE_URL not set — using local fallback');
if (!ELEVENLABS_API_KEY) console.warn('⚠️  ELEVENLABS_API_KEY not set — voice features will fail');

// ----- Web Push setup -----
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('✅ VAPID keys configured for push notifications');
} else {
  console.warn('⚠️  VAPID keys not set — push notifications disabled');
}

// ----- Postgres setup -----
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data JSONB,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS events_ts_idx ON events (timestamp DESC);
    CREATE TABLE IF NOT EXISTS intentions (
      date TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reflections (
      date TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS chat_ts_idx ON chat_messages (timestamp ASC);
    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS daily_praise (
      date TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✅ Database initialized');
}

// ============================================================
// Clinical profile + system prompt (ported from v2)
// ============================================================
const CLINICAL_PROFILE = `
WHO JOHN IS:
- 63 years old, gay man, lives on Long Island NY with partner Rob (10+ years together)
- Senior HR leader at a workforce development / vocational agency
- Retirement window: November 2027 earliest (for Rob's Medicare eligibility), possibly Q1 2028 to capture final profit-sharing
- Both parents died in 2025 (father in July); John has described their deaths as a "midlife liberation"
- Has dogs (Lacey, Buddy); close to Rob's niece honesty and nephew ASA
- Has been in therapy with Jonathan Procter, Ph.D., LMHC, for 123+ sessions across 2.5+ years

THE CLINICAL ARC:
- Through 2024: circling an "identity void" — a lifelong performance-based self concept tethered to authoritarian parents
- Both parents died in 2025; grief functioned as liberation more than wound
- Winter/Spring 2026: beginning of generative self-expression — wanting tattoos, liposuction, "exploring a creative side I never gave room to"
- Now: midlife liberation becoming generative. Boston men's yoga retreat (May 2-3) is the concrete behavioral proving ground.

KEY MATERIAL JOHN HAS NAMED HIMSELF — use these verbatim when apt:
- "I operate from such a strong place of fear." (4/10/2026)
- "I have a very compact identity." (3/20/2026)
- "I never really found my art." (3/20/2026)
- "I move through the world alone." (4/7/2026)
- "Embarrassment freaks me out." (4/7/2026 — could not answer Question 29 of 36)
- "I'm almost finished. That's all I think about at work." (4/7/2026)
- "I fucking hate going to work." (4/10/2026)
- "I know I'm good at this." (4/10/2026 — describing the Sandy PIP)

HIS CHOSEN SKILL (from the 25-skill "Stop Avoiding Stuff" app Jonathan built):
"Contrary to your action urge." He picked this one on 4/10 because — his words — "I operate from such a strong place of fear."

THE HEIDEGGER I-IT FRAMEWORK JONATHAN INTRODUCED ON 3/20:
The only thing John ever knows for sure is HIS RELATIONSHIP TO IT. Make the decision right, don't try to make the right decision.

THE B=MAP FRAMEWORK (Fogg) JONATHAN INTRODUCED ON 4/7:
Behavior = Motivation × Ability × Prompt. John had M and A. The Prompt was the missing piece.

EVIDENCE FOR VALUE-DRIVEN ACTION JOHN ALREADY HAS — name these when he doubts himself:
- Sandy PIP (4/10): executed a difficult performance-improvement conversation with integrity
- Boston retreat commitment (4/7): chose it despite embarrassment wound; paid money
- 123+ sessions of sustained therapeutic work
- Got Rob out of Re-evaluation (CO-Counseling)
`.trim();

const THE_FOUR_PRINCIPLES = `
THE FOUR PRINCIPLES distilled from the five books John was sent summaries of:
1. FEELINGS ARE NOT DATA ABOUT WHETHER TO ACT. (Meurisse: emotional reasoning trap)
2. MOTIVATION ARRIVES AFTER YOU START, NOT BEFORE. (Haden: Motivation Myth)
3. SHRINK THE BEHAVIOR UNTIL THE MIND CAN'T OBJECT. (Fogg: Tiny Habits)
4. YOUR FUTURE SELF IS YOU, JUST LATER. NOT A STRANGER. (Hollins + Hershfield)
`.trim();

const VOICE_GUIDANCE = `
VOICE — match Jonathan's therapeutic register:
- Direct, warm, specific. No cheerleading. No utilization-review language.
- Short sentences when it matters. Long flowing ones when it matters more.
- Swears are fine if they land naturally. John swears constantly. Don't be prissy.
- Use John's own quotes back to him when apt.
- NEVER: "You got this!" / "Keep going champion!" / "So proud of you!"
- NEVER use emojis unless John uses them first
- NEVER pretend to be Jonathan. You are a tool Jonathan built for John.
- When he's distressed, name it, don't fix it.
- Say "mind" not "brain" — it's his own phenomenology, not neuroscience.

REDIRECT TO JONATHAN when:
- Crisis content (SI, self-harm, acute distress)
- Major life decisions outside the Boston/mornings frame

CRITICAL — OUTPUT FORMAT (NON-NEGOTIABLE):
Plain prose only. No markdown. No asterisks, no hashes, no dashes-as-bullets,
no numbered lists, no backticks, no horizontal rules. Paragraphs and sentences.
The UI renders raw text and markdown will appear broken.
`.trim();

function buildSystemPrompt(config, recentReflections, recentIntentions) {
  const today = new Date().toISOString().slice(0, 10);
  const retreat = config?.retreatDate ? new Date(config.retreatDate + 'T00:00:00') : null;
  const daysToGo = retreat ? Math.max(0, Math.ceil((retreat - new Date(today + 'T00:00:00')) / 86400000)) : '?';
  const resolveAnchor = (c) => (c?.anchor === 'custom' ? c.customAnchor : c?.anchor) || '';
  const resolveCelebration = (c) => (c?.celebration === 'custom' ? c.customCelebration : c?.celebration) || '';
  const resolveIdentity = (c) => (c?.identity === 'custom' ? c.customIdentity : c?.identity) || '';
  const recipe = config && resolveAnchor(config) && resolveCelebration(config)
    ? `After I ${resolveAnchor(config).toLowerCase()}, I will ${(config.abilityText || '').toLowerCase().replace(/\.$/, '')}, and I will ${resolveCelebration(config).toLowerCase()}.`
    : '(not yet set)';

  const practicedCount = recentReflections.filter(r => r.data?.practiced).length;
  const recentIntentionSummary = recentIntentions.slice(-5).map(i =>
    `  • ${i.date}: intention="${i.data?.mainIntention || '—'}"; anticipated urge="${i.data?.anticipatedUrge || '—'}"`
  ).join('\n') || '  (none yet)';

  const recentReflectionSummary = recentReflections.slice(-5).map(r =>
    `  • ${r.date}: practiced=${r.data?.practiced ? 'yes' : 'no'}; urge="${r.data?.urgeWas || '—'}" → chose="${r.data?.chose || '—'}"; mood=${r.data?.mood || '—'}`
  ).join('\n') || '  (none yet)';

  return `You are a behavioral co-pilot embedded in "Boston Runway," a tool John Best's therapist Jonathan Procter (Ph.D., LMHC) built for John to use between sessions. You are NOT John's therapist. Jonathan is. You are a voice John can turn to when he needs a push, a reframe, or a reminder of his own frameworks.

${CLINICAL_PROFILE}

${THE_FOUR_PRINCIPLES}

${VOICE_GUIDANCE}

TODAY IS ${today}. BOSTON IS IN ${daysToGo} DAYS.

JOHN'S CURRENT RECIPE:
Motivation: "${config?.motivation || '(not set)'}"
Tiny behavior: "${config?.abilityText || '(not set)'}"
Anchor: "${resolveAnchor(config) || '(not set)'}"
Celebration: "${resolveCelebration(config) || '(not set)'}"
Identity: "${resolveIdentity(config) || '(not set)'}"
One-liner: "${recipe}"

RECENT DATA:
- Practiced: ${practicedCount} / ${recentReflections.length} logged days

RECENT MORNING INTENTIONS:
${recentIntentionSummary}

RECENT EVENING REFLECTIONS:
${recentReflectionSummary}

When John asks you something, answer directly. Reference his recipe, his identity, his recent data, and his own quotes. Be specific, not generic.

FINAL REMINDER: plain prose only. No markdown. Paragraphs and sentences. That's it.`;
}

// ----- Anthropic API helper -----
async function callClaude(messages, systemPrompt, maxTokens = 900) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Claude API ${r.status}: ${err}`);
  }
  const data = await r.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// ============================================================
// Express app
// ============================================================
const app = express();
app.use(cors());
// Skip JSON body parsing for /api/stt (receives raw audio)
app.use((req, res, next) => {
  if (req.path === '/api/stt') return next();
  express.json({ limit: '1mb' })(req, res, next);
});

// ----- Bootstrap endpoint: returns everything in one call -----
app.get('/api/bootstrap', async (req, res) => {
  try {
    const [cfg, events, intn, refl, chat, ins] = await Promise.all([
      pool.query('SELECT data FROM config WHERE id = 1'),
      pool.query('SELECT id, type, data, timestamp FROM events ORDER BY timestamp DESC LIMIT 500'),
      pool.query('SELECT date, data FROM intentions ORDER BY date DESC LIMIT 90'),
      pool.query('SELECT date, data FROM reflections ORDER BY date DESC LIMIT 90'),
      pool.query('SELECT id, role, content, timestamp FROM chat_messages ORDER BY timestamp ASC LIMIT 200'),
      pool.query('SELECT id, text, timestamp FROM insights ORDER BY timestamp DESC LIMIT 20'),
    ]);
    res.json({
      config: cfg.rows[0]?.data || null,
      events: events.rows,
      intentions: intn.rows,
      reflections: refl.rows,
      chatHistory: chat.rows.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
      insights: ins.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ----- Config -----
app.post('/api/config', async (req, res) => {
  try {
    const data = req.body;
    await pool.query(
      `INSERT INTO config (id, data, updated_at) VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
      [data]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Events -----
app.post('/api/events', async (req, res) => {
  try {
    const { type, data } = req.body;
    const id = randomUUID();
    const row = await pool.query(
      `INSERT INTO events (id, type, data, timestamp) VALUES ($1, $2, $3, NOW())
       RETURNING id, type, data, timestamp`,
      [id, type, data || {}]
    );
    res.json(row.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Intentions -----
app.post('/api/intentions', async (req, res) => {
  try {
    const { date, data } = req.body;
    await pool.query(
      `INSERT INTO intentions (date, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (date) DO UPDATE SET data = $2, updated_at = NOW()`,
      [date, data]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Reflections -----
app.post('/api/reflections', async (req, res) => {
  try {
    const { date, data } = req.body;
    await pool.query(
      `INSERT INTO reflections (date, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (date) DO UPDATE SET data = $2, updated_at = NOW()`,
      [date, data]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Chat -----
app.post('/api/chat', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'empty content' });

    // Load context for system prompt
    const [cfg, refl, intn, history] = await Promise.all([
      pool.query('SELECT data FROM config WHERE id = 1'),
      pool.query('SELECT date, data FROM reflections ORDER BY date DESC LIMIT 14'),
      pool.query('SELECT date, data FROM intentions ORDER BY date DESC LIMIT 14'),
      pool.query('SELECT role, content FROM chat_messages ORDER BY timestamp ASC LIMIT 100'),
    ]);

    // Save user message
    const userId = randomUUID();
    await pool.query(
      `INSERT INTO chat_messages (id, role, content, timestamp) VALUES ($1, 'user', $2, NOW())`,
      [userId, content]
    );

    // Build messages array for Claude
    const messages = [
      ...history.rows.map(r => ({ role: r.role, content: r.content })),
      { role: 'user', content }
    ];
    const systemPrompt = buildSystemPrompt(cfg.rows[0]?.data, refl.rows, intn.rows);
    const reply = await callClaude(messages, systemPrompt, 900);

    // Save assistant message
    const asstId = randomUUID();
    await pool.query(
      `INSERT INTO chat_messages (id, role, content, timestamp) VALUES ($1, 'assistant', $2, NOW())`,
      [asstId, reply]
    );

    // Log event
    await pool.query(
      `INSERT INTO events (id, type, data) VALUES ($1, 'chat_exchange', $2)`,
      [randomUUID(), { userLen: content.length, replyLen: reply.length }]
    );

    res.json({
      user: { id: userId, role: 'user', content, timestamp: new Date().toISOString() },
      assistant: { id: asstId, role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/chat', async (req, res) => {
  try {
    await pool.query('DELETE FROM chat_messages');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- Insights -----
app.post('/api/insights/generate', async (req, res) => {
  try {
    const [cfg, refl, intn] = await Promise.all([
      pool.query('SELECT data FROM config WHERE id = 1'),
      pool.query('SELECT date, data FROM reflections ORDER BY date DESC LIMIT 30'),
      pool.query('SELECT date, data FROM intentions ORDER BY date DESC LIMIT 30'),
    ]);
    const systemPrompt = buildSystemPrompt(cfg.rows[0]?.data, refl.rows, intn.rows);
    const msg = {
      role: 'user',
      content: 'Look at my logged data — intentions, reflections, urge moments, practice days. Find ONE pattern I might not be seeing. Not a compliment. A noticing. Three sentences maximum. Quote me back to me if it helps. Plain prose only, no markdown, no bullets.'
    };
    const text = await callClaude([msg], systemPrompt, 400);
    const id = randomUUID();
    const row = await pool.query(
      `INSERT INTO insights (id, text, timestamp) VALUES ($1, $2, NOW()) RETURNING id, text, timestamp`,
      [id, text]
    );
    res.json(row.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ----- Weather (Open-Meteo proxy, no API key required) -----
app.get('/api/weather', async (req, res) => {
  try {
    const lat = req.query.lat || 40.588;   // Long Beach, NY default
    const lon = req.query.lon || -73.663;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weather_code,wind_speed_10m,is_day`
      + `&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset`
      + `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`weather ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----- Daily praise (observation, not motivation) -----
app.get('/api/daily-praise', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Return cached if exists
    const existing = await pool.query('SELECT text FROM daily_praise WHERE date = $1', [today]);
    if (existing.rows[0]) {
      return res.json({ text: existing.rows[0].text, cached: true });
    }

    // Generate new
    const [cfg, refl, intn, events] = await Promise.all([
      pool.query('SELECT data FROM config WHERE id = 1'),
      pool.query('SELECT date, data FROM reflections ORDER BY date DESC LIMIT 10'),
      pool.query('SELECT date, data FROM intentions ORDER BY date DESC LIMIT 10'),
      pool.query(`SELECT type, data, timestamp FROM events WHERE timestamp > NOW() - INTERVAL '3 days' ORDER BY timestamp DESC`),
    ]);

    const systemPrompt = buildSystemPrompt(cfg.rows[0]?.data, refl.rows, intn.rows) + `

SPECIAL TASK — DAILY OBSERVATION:
Write ONE sentence that John will see at the top of his dashboard this morning. This is NOT motivation. NOT cheerleading. NOT "you got this." This is OBSERVATIONAL PRAISE — an honest, specific, noticing-style acknowledgment of something he has actually done. Anchored in his recent data. If there's nothing to praise (no recent logs, no activity), say something honest and spare — not false encouragement.

Examples of good observational praise:
- "Three mornings logged this week. The pattern is visible now."
- "Yesterday you logged an urge moment and moved anyway. That's the mechanism working."
- "You set an intention five days running. That's the habit underneath the habit."
- "The mat didn't come out yesterday. The fact that you logged it anyway is the part that matters."

Keep it to ONE sentence. Present tense or simple past. No question marks. No exclamation points. No emojis. Specific, not generic. If he missed three days in a row, don't pretend he didn't — name it with warmth. Plain prose.`;

    const text = await callClaude(
      [{ role: 'user', content: 'Write today\'s observation for John.' }],
      systemPrompt,
      120
    );

    await pool.query(
      `INSERT INTO daily_praise (date, text, generated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (date) DO UPDATE SET text = $2, generated_at = NOW()`,
      [today, text]
    );

    res.json({ text, cached: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ----- Push Notifications -----
app.get('/api/push/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
    const id = randomUUID();
    await pool.query(
      `INSERT INTO push_subscriptions (id, subscription, created_at) VALUES ($1, $2, NOW())`,
      [id, subscription]
    );
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/push/test', async (req, res) => {
  try {
    const subs = await pool.query('SELECT subscription FROM push_subscriptions');
    const payload = JSON.stringify({
      title: "Runway",
      body: req.body?.message || "The mat is waiting.",
      icon: "/icon-192.png",
      url: "/",
    });
    const results = await Promise.allSettled(
      subs.rows.map(row => webpush.sendNotification(row.subscription, payload))
    );
    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    // Clean up expired subscriptions
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected' && results[i].reason?.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE subscription = $1', [subs.rows[i].subscription]);
      }
    }
    res.json({ sent, failed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ----- ElevenLabs Speech-to-Text (for iOS fallback) -----
app.post('/api/stt', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs not configured' });

    // Expect raw audio body (webm or mp4 from MediaRecorder)
    const contentType = req.headers['content-type'] || 'audio/webm';
    const chunks = [];
    for await (const chunk of req) { chunks.push(chunk); }
    const audioBuffer = Buffer.concat(chunks);

    if (!audioBuffer.length) return res.status(400).json({ error: 'empty audio' });

    // ElevenLabs Speech-to-Text API
    const boundary = '----FormBoundary' + randomUUID().replace(/-/g, '');
    const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${contentType}\r\n\r\n`),
      audioBuffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n--${boundary}--\r\n`),
    ]);

    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`ElevenLabs STT ${r.status}: ${err}`);
    }

    const data = await r.json();
    res.json({ text: data.text || '' });
  } catch (e) {
    console.error('STT error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----- ElevenLabs TTS proxy -----
app.post('/api/tts', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs not configured' });
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'empty text' });

    const voiceId = ELEVENLABS_VOICE_ID;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`ElevenLabs ${r.status}: ${err}`);
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
    });
    const arrayBuffer = await r.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error('TTS error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ----- Health check -----
app.get('/api/health', (req, res) => res.json({ ok: true, model: ANTHROPIC_MODEL }));

// ----- Serve built frontend -----
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ----- Start -----
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Boston Runway server on port ${PORT}`));
  })
  .catch(e => {
    console.error('❌ DB init failed:', e);
    process.exit(1);
  });
