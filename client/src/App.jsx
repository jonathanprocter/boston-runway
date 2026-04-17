import { useState, useEffect, useRef } from 'react';
import { api, fmtDate, fmtDateTime } from './api';

// Default location: Long Beach, NY (John's area)
const DEFAULT_LOCATION = { lat: 40.588, lon: -73.663, name: 'Long Beach, NY' };

// Open-Meteo WMO weather codes → short phrase + emoji-free symbol
function weatherDescription(code, isDay = 1) {
  const map = {
    0: ['Clear sky', '☀'],
    1: ['Mainly clear', '☀'],
    2: ['Partly cloudy', '⛅'],
    3: ['Overcast', '☁'],
    45: ['Fog', '☁'],
    48: ['Freezing fog', '☁'],
    51: ['Light drizzle', '☂'],
    53: ['Drizzle', '☂'],
    55: ['Heavy drizzle', '☂'],
    61: ['Light rain', '☂'],
    63: ['Rain', '☂'],
    65: ['Heavy rain', '☂'],
    71: ['Light snow', '❄'],
    73: ['Snow', '❄'],
    75: ['Heavy snow', '❄'],
    77: ['Snow grains', '❄'],
    80: ['Rain showers', '☂'],
    81: ['Heavy showers', '☂'],
    82: ['Violent showers', '☂'],
    85: ['Snow showers', '❄'],
    86: ['Heavy snow showers', '❄'],
    95: ['Thunderstorm', '⚡'],
    96: ['Thunderstorm w/ hail', '⚡'],
    99: ['Severe thunderstorm', '⚡'],
  };
  const entry = map[code] || ['Weather', '○'];
  return { label: entry[0], symbol: isDay ? entry[1] : '☽' };
}

export default function App() {
  // ---------- state ----------
  const [phase, setPhase] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [config, setConfig] = useState({
    motivation: '',
    abilityVersion: 'starter',
    abilityText: 'Unroll the mat and sit on it.',
    anchor: '',
    customAnchor: '',
    celebration: '',
    customCelebration: '',
    identity: 'I am a yogi who practices.',
    customIdentity: '',
    retreatDate: '2026-05-02',
    startDate: new Date().toISOString().slice(0, 10),
    createdAt: null,
    location: DEFAULT_LOCATION,
  });
  const [events, setEvents] = useState([]);
  const [intentions, setIntentions] = useState([]);
  const [reflections, setReflections] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [insights, setInsights] = useState([]);

  // Weather + praise
  const [weather, setWeather] = useState(null);
  const [praise, setPraise] = useState(null);
  const [praiseLoading, setPraiseLoading] = useState(false);

  // Ephemeral drafts
  const [morningDraft, setMorningDraft] = useState({
    mainIntention: '', anticipatedUrge: '', mood: 4,
  });
  const [eveningDraft, setEveningDraft] = useState({
    practiced: null, grewBeyond: false, urgeWas: '', chose: '', urgeWon: true, mood: 4, note: '',
  });
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const chatEndRef = useRef(null);

  // UI toggles for collapsible sections in morning/evening
  const [uiMorningCustomIntent, setUiMorningCustomIntent] = useState(false);
  const [uiMorningCustomUrge, setUiMorningCustomUrge] = useState(false);
  const [uiEveningHadUrge, setUiEveningHadUrge] = useState(false);
  const [uiEveningCustomUrge, setUiEveningCustomUrge] = useState(false);
  const [uiEveningCustomChose, setUiEveningCustomChose] = useState(false);
  const [uiEveningShowNote, setUiEveningShowNote] = useState(false);

  // ---------- init ----------
  useEffect(() => {
    (async () => {
      try {
        const boot = await api.bootstrap();
        setEvents(boot.events || []);
        setIntentions((boot.intentions || []).map(i => ({ ...i.data, date: i.date })));
        setReflections((boot.reflections || []).map(r => ({ ...r.data, date: r.date })));
        setChatHistory(boot.chatHistory || []);
        setInsights(boot.insights || []);
        if (boot.config) {
          setConfig({ ...boot.config });
          await api.logEvent('app_opened');
          setPhase('dashboard');
          // Fetch weather + praise in parallel after setting dashboard phase
          const loc = boot.config.location || DEFAULT_LOCATION;
          api.weather(loc.lat, loc.lon).then(setWeather).catch(() => {});
          setPraiseLoading(true);
          api.dailyPraise()
            .then(p => { setPraise(p); setPraiseLoading(false); })
            .catch(() => { setPraiseLoading(false); });
        } else {
          setPhase('welcome');
        }
      } catch (e) {
        console.error('Bootstrap failed:', e);
        setLoadError(e.message);
        setPhase('error');
      }
    })();
    // eslint-disable-next-line
  }, []);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (phase === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, phase, chatLoading]);

  // ---------- derived ----------
  const today = new Date().toISOString().slice(0, 10);
  const retreat = new Date(config.retreatDate + 'T00:00:00');
  const daysToGo = Math.max(0, Math.ceil((retreat - new Date(today + 'T00:00:00')) / 86400000));
  const startDate = config.startDate || today;
  const totalRunwayDays = Math.max(1, Math.ceil((retreat - new Date(startDate + 'T00:00:00')) / 86400000));
  const elapsedDays = Math.max(0, totalRunwayDays - daysToGo);
  const progressPct = Math.min(100, Math.round((elapsedDays / totalRunwayDays) * 100));
  const todayIntention = intentions.find(i => i.date === today);
  const todayReflection = reflections.find(r => r.date === today);
  const resolvedAnchor = config.anchor === 'custom' ? config.customAnchor : config.anchor;
  const resolvedCelebration = config.celebration === 'custom' ? config.customCelebration : config.celebration;
  const resolvedIdentity = config.identity === 'custom' ? config.customIdentity : config.identity;
  const streak = (() => {
    let s = 0;
    const sorted = [...reflections].sort((a, b) => b.date.localeCompare(a.date));
    for (const l of sorted) { if (l.practiced) s++; else break; }
    return s;
  })();
  const practicedCount = reflections.filter(l => l.practiced).length;

  // ---------- actions ----------
  const update = (patch) => setConfig(prev => ({ ...prev, ...patch }));

  const goTo = (p) => {
    api.logEvent('screen_viewed', { from: phase, to: p }).catch(() => {});
    setPhase(p);
  };

  const finalizeSetup = async () => {
    const withTimestamp = { ...config, createdAt: new Date().toISOString() };
    setConfig(withTimestamp);
    await api.saveConfig(withTimestamp);
    await api.logEvent('config_saved', { identity: resolvedIdentity });
    goTo('recipe');
  };

  const saveMorning = async () => {
    const entry = {
      time: new Date().toISOString(),
      mainIntention: morningDraft.mainIntention,
      anticipatedUrge: morningDraft.anticipatedUrge,
      mood: morningDraft.mood,
    };
    await api.saveIntention(today, entry);
    const next = intentions.filter(i => i.date !== today).concat([{ ...entry, date: today }]);
    setIntentions(next);
    await api.logEvent('morning_intention_set', { date: today, mainIntention: entry.mainIntention });
    goTo('dashboard');
  };

  const saveEvening = async () => {
    const entry = {
      time: new Date().toISOString(),
      practiced: eveningDraft.practiced,
      grewBeyond: eveningDraft.grewBeyond,
      urgeWas: eveningDraft.urgeWas,
      chose: eveningDraft.chose,
      urgeWon: eveningDraft.urgeWon,
      mood: eveningDraft.mood,
      note: eveningDraft.note,
    };
    await api.saveReflection(today, entry);
    const next = reflections.filter(r => r.date !== today).concat([{ ...entry, date: today }]);
    setReflections(next);
    await api.logEvent('evening_reflection_saved', { date: today, practiced: entry.practiced });
    goTo('dashboard');
  };

  const sendChatMessage = async (override) => {
    const text = (override ?? chatInput).trim();
    if (!text) return;
    setChatInput('');
    setChatLoading(true);
    // Optimistic update
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setChatHistory(prev => [...prev, userMsg]);
    try {
      const result = await api.sendChat(text);
      setChatHistory(prev => {
        // Replace optimistic user msg with server version and append assistant
        const withoutLast = prev.slice(0, -1);
        return [...withoutLast, result.user, result.assistant];
      });
    } catch (err) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `The API call failed: ${err.message}. The recipe hasn't moved — after you ${resolvedAnchor.toLowerCase()}, the mat comes out.`,
        timestamp: new Date().toISOString(),
        error: true,
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = async () => {
    try { await api.clearChat(); setChatHistory([]); } catch {}
  };

  const generateInsight = async () => {
    setInsightLoading(true);
    try {
      const ins = await api.generateInsight();
      setInsights(prev => [...prev, ins]);
    } catch (err) {
      setInsights(prev => [...prev, {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        text: `(API failed: ${err.message})`,
        error: true,
      }]);
    } finally {
      setInsightLoading(false);
    }
  };

  // ============================================================
  // SHARED UI
  // ============================================================
  const Shell = ({ children, showNav = false }) => (
    <div className="min-h-screen body john-bg john-ink">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10">
        {showNav && (
          <div className="mb-10 flex flex-wrap justify-between items-center text-xs uppercase tracking-[0.2em] john-muted gap-3 stagger-in">
            <button onClick={() => goTo('dashboard')} className="nav-link tabular">
              Boston Runway · {fmtDate(today)}
            </button>
            <div className="flex gap-5">
              <button onClick={() => goTo('chat')} className="nav-link">Companion</button>
              <button onClick={() => goTo('timeline')} className="nav-link">Timeline</button>
              <button onClick={() => goTo('cheatsheet')} className="nav-link">When urge hits</button>
            </div>
          </div>
        )}
        <div className="fade-in">{children}</div>
      </div>
    </div>
  );

  const BigButton = ({ onClick, children, disabled, variant = 'primary', className = '' }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-7 py-3 text-sm uppercase tracking-[0.18em] rounded-btn btn-lift ${
        disabled ? 'opacity-30 cursor-not-allowed' : ''
      } ${variant === 'primary'
          ? 'john-accent-bg text-white warm-shadow-sm hover-accent hover:accent-shadow-md'
          : 'border john-border john-ink hover-card hover:warm-shadow-md'
      } ${className}`}
    >
      {children}
    </button>
  );

  const Pill = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-3 border body text-lg rounded-btn chip-tactile ${
        active ? 'john-accent-bg text-white border-transparent warm-shadow-sm' : 'john-border john-ink hover-card'
      }`}
    >{children}</button>
  );

  const Eyebrow = ({ children }) => (
    <div className="text-xs uppercase tracking-[0.24em] john-muted mb-4">{children}</div>
  );

  const Chip = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 border text-base rounded-chip chip-tactile ${
        active ? 'john-accent-bg text-white border-transparent warm-shadow-sm' : 'john-border john-ink hover-card'
      }`}
    >{children}</button>
  );

  // ============================================================
  // DAILY PRAISE CARD
  // ============================================================
  const DailyPraiseCard = () => {
    if (!praise && !praiseLoading) return null;
    return (
      <div className="stagger-in delay-1 mb-8">
        <div className="john-card p-6 sm:p-7 relative overflow-hidden">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="avatar-dot avatar-dot-claude">C</div>
            </div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-[0.22em] john-accent mb-2">Today's observation</div>
              {praiseLoading ? (
                <div className="flex items-center gap-1 py-1">
                  <span className="w-1.5 h-1.5 rounded-full john-accent-bg pulse" />
                  <span className="w-1.5 h-1.5 rounded-full john-accent-bg pulse" style={{ animationDelay: '0.2s' }} />
                  <span className="w-1.5 h-1.5 rounded-full john-accent-bg pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              ) : (
                <div className="display text-lg sm:text-xl leading-relaxed italic">
                  {praise?.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // WEATHER CARD
  // ============================================================
  const WeatherCard = () => {
    if (!weather) return null;
    const current = weather.current || {};
    const daily = weather.daily || {};
    const temp = Math.round(current.temperature_2m);
    const hi = daily.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : null;
    const lo = daily.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null;
    const code = current.weather_code ?? 0;
    const isDay = current.is_day ?? 1;
    const { label, symbol } = weatherDescription(code, isDay);
    const sunrise = daily.sunrise?.[0] ? new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    const sunset = daily.sunset?.[0] ? new Date(daily.sunset[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

    return (
      <div className="stagger-in delay-2 mb-8">
        <div className="weather-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="display text-5xl john-ink" style={{ lineHeight: 1 }}>{symbol}</div>
              <div>
                <div className="flex items-baseline gap-2">
                  <div className="display text-4xl font-medium tabular">{temp}°</div>
                  <div className="text-sm john-muted">F</div>
                </div>
                <div className="text-sm john-muted mt-0.5">{label} · {config.location?.name || DEFAULT_LOCATION.name}</div>
              </div>
            </div>
            <div className="text-right text-xs john-muted tabular space-y-1">
              {hi != null && lo != null && (
                <div><span className="john-ink font-medium">{hi}° / {lo}°</span> today</div>
              )}
              {sunrise && sunset && (
                <div>↑ {sunrise} · ↓ {sunset}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // LOADING / ERROR
  // ============================================================
  if (phase === 'loading') {
    return (
      <Shell>
        <div className="flex items-center gap-3 john-muted text-sm pulse">
          <div className="w-2 h-2 rounded-full john-accent-bg" />
          Loading your runway…
        </div>
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <h1 className="display text-3xl mb-4">Couldn't reach the server</h1>
        <p className="john-muted mb-4">{loadError}</p>
        <p className="john-muted text-sm">Check the server logs or try refreshing the page.</p>
      </Shell>
    );
  }

  // ============================================================
  // SETUP WIZARD
  // ============================================================
  if (phase === 'welcome') {
    return (
      <Shell>
        <Eyebrow>A runway, not a résumé</Eyebrow>
        <h1 className="display text-5xl sm:text-6xl leading-[1.05] mb-8 font-medium">
          You already made the big choice.<br />
          <span className="john-accent italic">Now we build the mornings.</span>
        </h1>
        <div className="rule mb-8" />
        <div className="space-y-5 text-xl leading-relaxed">
          <p>
            Boston is in <span className="john-accent font-medium">{daysToGo} days</span>. The money is spent.
            The Ulysses pact is signed. What we haven't done yet is specify the thing
            that actually makes the mornings happen.
          </p>
          <p>
            This tool will take about twelve minutes to set up. After that it logs every interaction,
            every intention, every urge-moment. Claude is built in with your clinical context so you
            can ask questions between sessions.
          </p>
        </div>
        <div className="mt-12">
          <BigButton onClick={() => goTo('diagnostic')}>Begin</BigButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'diagnostic') {
    return (
      <Shell>
        <Eyebrow>Step 1 of 6 · An honest question</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-8 font-medium">
          Between April 7th and today, how many mornings did the mat come out?
        </h1>
        <div className="space-y-3 mb-10 max-w-xl">
          {[
            { label: 'Zero.', val: 0 },
            { label: 'One, maybe two.', val: 1 },
            { label: 'Most of them.', val: 2 },
            { label: 'All of them. I\'m a liar.', val: 3 }
          ].map(opt => (
            <button
              key={opt.label}
              onClick={async () => { await api.logEvent('diagnostic_answered', { value: opt.val }); goTo('principles'); }}
              className="w-full text-left px-6 py-4 border john-border john-ink body text-xl hover-card rounded-btn btn-lift"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="john-muted italic text-lg">
          Whichever one you picked, the next screen is the same. The number isn't the point.
        </p>
      </Shell>
    );
  }

  if (phase === 'principles') {
    const principles = [
      { n: '01', title: 'Your feelings are not data about whether to act.',
        body: 'Tired is a feeling. Resistant is a feeling. Scared-of-Boston is a feeling. They feel like facts. They are not. You can act while they are present. You have, in fact, done this your entire adult life.' },
      { n: '02', title: 'Motivation arrives after you start. Not before.',
        body: 'You already know this from every gym year that worked. You sat down waiting for motivation on April 8th, 9th, and 10th. It never came. It never does. It comes five minutes after you roll the mat out, and not before.' },
      { n: '03', title: "Shrink the behavior until your mind can't object.",
        body: "Fifteen minutes is a cliff. Two minutes is not. Unrolling the mat and sitting on it is not even two minutes. That's on purpose. Anything more is extra credit." },
      { n: '04', title: 'Your future self is you, just later. Not a stranger.',
        body: "The John who boards the plane on May 1st is the John reading this. He isn't going to become a yogi in the cab to the airport. Everything he knows by then, you teach him now." }
    ];
    return (
      <Shell>
        <Eyebrow>Step 2 of 6 · Four things, said once</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-10 font-medium">
          The books all agree. They've been<br />
          saying the same thing to each other<br />
          for thirty years.
        </h1>
        <div className="space-y-8">
          {principles.map(p => (
            <div key={p.n} className="flex gap-6">
              <div className="mono text-sm john-accent pt-1">{p.n}</div>
              <div className="flex-1">
                <h3 className="display text-xl sm:text-2xl font-medium mb-2">{p.title}</h3>
                <p className="text-lg john-muted leading-relaxed">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <BigButton onClick={() => goTo('motivation')}>Got it. Build the sentence →</BigButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'motivation') {
    const motivations = [
      'Not making an ass of myself in front of forty men.',
      "I put money on this. I'm not throwing it away.",
      "I said I would. That used to mean something and I'm making it mean something again.",
      "Because pre-liberation John would never have done this, and I'm not him anymore.",
      "My body wants this. I've been ignoring it.",
    ];
    return (
      <Shell>
        <Eyebrow>Step 3 of 6 · Motivation</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-4 font-medium">Why is this the thing you're doing?</h1>
        <p className="text-lg john-muted mb-8">Pick the most honest one. Not the noblest. You can change it later.</p>
        <div className="space-y-3 mb-8">
          {motivations.map(m => (
            <Pill key={m} active={config.motivation === m} onClick={() => update({ motivation: m })}>{m}</Pill>
          ))}
          <input
            type="text"
            placeholder="Or write your own…"
            value={config.motivation && !motivations.includes(config.motivation) ? config.motivation : ''}
            onChange={e => update({ motivation: e.target.value })}
            className="w-full px-5 py-3 border john-border john-bg body text-lg focus:outline-none focus:border-black smooth rounded-btn"
          />
        </div>
        <div className="flex gap-3">
          <BigButton variant="ghost" onClick={() => goTo('principles')}>← Back</BigButton>
          <BigButton onClick={() => goTo('ability')} disabled={!config.motivation}>Continue →</BigButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'ability') {
    const options = [
      { key: 'starter', label: 'Unroll the mat and sit on it.', desc: 'Starter step. Thirty seconds. Ridiculously small on purpose.', rec: 'Recommended' },
      { key: 'scaled', label: 'Two minutes. One pose or one flow.', desc: 'Scaled-back version. Short enough that your mind can\'t build a case against it.' },
      { key: 'full', label: 'The full fifteen-minute cycle.', desc: "The one that didn't happen April 7-10. Your call. Books are not on your side here." },
    ];
    return (
      <Shell>
        <Eyebrow>Step 4 of 6 · Ability</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-4 font-medium">How small do we make it?</h1>
        <p className="text-lg john-muted mb-8">You don't have to do a small thing forever. You have to do a small thing <em>tomorrow</em>.</p>
        <div className="space-y-3 mb-8">
          {options.map(opt => (
            <button
              key={opt.key}
              onClick={() => update({ abilityVersion: opt.key, abilityText: opt.label })}
              className={`w-full text-left p-5 border rounded-btn btn-lift ${
                config.abilityVersion === opt.key ? 'john-accent-bg text-white border-transparent warm-shadow-sm' : 'john-border hover-card'
              }`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <div className="display text-xl font-medium">{opt.label}</div>
                {opt.rec && <div className={`text-xs uppercase tracking-[0.18em] ${config.abilityVersion === opt.key ? 'text-white' : 'john-accent'}`}>{opt.rec}</div>}
              </div>
              <div className={`text-base ${config.abilityVersion === opt.key ? 'text-white opacity-90' : 'john-muted'}`}>{opt.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <BigButton variant="ghost" onClick={() => goTo('motivation')}>← Back</BigButton>
          <BigButton onClick={() => goTo('prompt')}>Continue →</BigButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'prompt') {
    const anchors = [
      'I pour my first cup of coffee',
      'I let the dogs out in the morning',
      'I finish my first pee of the day',
      'Rob leaves the room',
      'I take my morning pills',
      'I put my feet on the floor getting out of bed',
    ];
    return (
      <Shell>
        <Eyebrow>Step 5 of 6 · Prompt · The piece that was missing</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-4 font-medium">
          What already-automatic thing<br /><span className="italic">becomes the cue?</span>
        </h1>
        <p className="text-lg john-muted mb-8">
          Without a prompt, nothing happens. The prompt rides on something you already do without thinking.
        </p>
        <div className="space-y-3 mb-6">
          <div className="text-sm uppercase tracking-[0.18em] john-muted mb-2">After I…</div>
          {anchors.map(a => (
            <Pill key={a} active={config.anchor === a} onClick={() => update({ anchor: a })}>{a}</Pill>
          ))}
          <Pill active={config.anchor === 'custom'} onClick={() => update({ anchor: 'custom' })}>Something else (I'll type it)</Pill>
          {config.anchor === 'custom' && (
            <input
              type="text"
              placeholder="After I…"
              value={config.customAnchor}
              onChange={e => update({ customAnchor: e.target.value })}
              className="w-full px-5 py-3 border john-border john-bg body text-lg focus:outline-none focus:border-black smooth rounded-btn"
            />
          )}
        </div>
        {resolvedAnchor && (
          <div className="mt-8 p-6 john-card">
            <div className="text-sm uppercase tracking-[0.18em] john-muted mb-2">Your prompt</div>
            <div className="display text-xl sm:text-2xl leading-snug">
              After I <span className="john-accent italic">{resolvedAnchor.toLowerCase()}</span>, I will <span className="john-accent italic">{config.abilityText.toLowerCase().replace(/\.$/, '')}.</span>
            </div>
          </div>
        )}
        <div className="flex gap-3 mt-8">
          <BigButton variant="ghost" onClick={() => goTo('ability')}>← Back</BigButton>
          <BigButton onClick={() => goTo('celebration')} disabled={!resolvedAnchor || (config.anchor === 'custom' && !config.customAnchor)}>Continue →</BigButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'celebration') {
    const celebrations = [
      'Do a quiet fist pump',
      'Say out loud: "that\'s what I\'m talking about"',
      'Smile at myself in the mirror',
      'Snap my fingers twice',
      'Whisper "good boy" to myself (I\'m not kidding, it works)',
      'Hum eight bars of something dramatic',
    ];
    return (
      <Shell>
        <Eyebrow>Step 6 of 6 · Celebration</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-4 font-medium">
          The part you'll want to skip.<br /><span className="italic john-accent">Don't.</span>
        </h1>
        <p className="text-lg john-muted mb-8">
          Small, immediate, slightly ridiculous celebration is how the sequence gets wired in.
        </p>
        <div className="space-y-3 mb-6">
          {celebrations.map(c => (
            <Pill key={c} active={config.celebration === c} onClick={() => update({ celebration: c })}>{c}</Pill>
          ))}
          <Pill active={config.celebration === 'custom'} onClick={() => update({ celebration: 'custom' })}>Something else</Pill>
          {config.celebration === 'custom' && (
            <input
              type="text"
              placeholder="I will…"
              value={config.customCelebration}
              onChange={e => update({ customCelebration: e.target.value })}
              className="w-full px-5 py-3 border john-border john-bg body text-lg focus:outline-none focus:border-black smooth rounded-btn"
            />
          )}
        </div>
        <div className="flex gap-3 mt-8">
          <BigButton variant="ghost" onClick={() => goTo('prompt')}>← Back</BigButton>
          <BigButton onClick={() => goTo('identity')} disabled={!resolvedCelebration || (config.celebration === 'custom' && !config.customCelebration)}>Continue →</BigButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'identity') {
    const identities = [
      'I am a yogi who practices.',
      "I am a man who moves toward what he said he'd do.",
      'I am someone who does the thing before he feels like it.',
      'I am a beginner, and that is not a problem.',
    ];
    return (
      <Shell>
        <Eyebrow>One more · Identity</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-4 font-medium">
          Finish this sentence and<br /><span className="italic">mean it.</span>
        </h1>
        <p className="text-lg john-muted mb-8">
          Not "I'm trying to do yoga." Present tense identity. You said this on April 7th yourself.
        </p>
        <div className="space-y-3 mb-6">
          {identities.map(i => (
            <Pill key={i} active={config.identity === i} onClick={() => update({ identity: i })}>{i}</Pill>
          ))}
          <Pill active={config.identity === 'custom'} onClick={() => update({ identity: 'custom' })}>Write my own</Pill>
          {config.identity === 'custom' && (
            <input
              type="text"
              placeholder="I am…"
              value={config.customIdentity}
              onChange={e => update({ customIdentity: e.target.value })}
              className="w-full px-5 py-3 border john-border john-bg body text-lg focus:outline-none focus:border-black smooth rounded-btn"
            />
          )}
        </div>
        <div className="flex gap-3 mt-8">
          <BigButton variant="ghost" onClick={() => goTo('celebration')}>← Back</BigButton>
          <BigButton
            onClick={finalizeSetup}
            disabled={!resolvedIdentity || (config.identity === 'custom' && !config.customIdentity)}
          >Lock it in →</BigButton>
        </div>
      </Shell>
    );
  }

  if (phase === 'recipe') {
    return (
      <Shell>
        <Eyebrow>The sentence</Eyebrow>
        <h1 className="display text-3xl sm:text-4xl leading-[1.15] mb-10 font-medium">
          This is the only thing that has to live<br />
          in your head between now and May 2nd.
        </h1>
        <div className="p-8 sm:p-10 john-card mb-10">
          <div className="text-sm uppercase tracking-[0.18em] john-muted mb-6">Your recipe</div>
          <div className="display text-2xl sm:text-3xl leading-[1.3] john-ink mb-8">
            After I <span className="john-accent italic">{resolvedAnchor.toLowerCase()}</span>,<br />
            I will <span className="john-accent italic">{config.abilityText.toLowerCase().replace(/\.$/, '')}</span>,<br />
            and I will <span className="john-accent italic">{resolvedCelebration.toLowerCase()}</span>.
          </div>
          <div className="rule mb-6" />
          <div className="text-sm uppercase tracking-[0.18em] john-muted mb-3">Your identity</div>
          <div className="display text-xl sm:text-2xl italic john-ink">{resolvedIdentity}</div>
        </div>
        <div className="space-y-4 text-lg john-muted mb-10">
          <p>That's it. That's the whole tool.</p>
          <p className="italic john-ink">Fifteen mornings from now, you get on a plane.</p>
        </div>
        <BigButton onClick={async () => {
          goTo('dashboard');
          // Kick off weather + praise for first dashboard view
          const loc = config.location || DEFAULT_LOCATION;
          api.weather(loc.lat, loc.lon).then(setWeather).catch(() => {});
          setPraiseLoading(true);
          api.dailyPraise().then(p => { setPraise(p); setPraiseLoading(false); }).catch(() => setPraiseLoading(false));
        }}>Open my runway →</BigButton>
      </Shell>
    );
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  if (phase === 'dashboard') {
    const dayOfWeek = new Date(today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    return (
      <Shell showNav>
        {/* Date ornament */}
        <div className="stagger-in mb-6">
          <div className="ornament text-xs uppercase tracking-[0.3em] tabular">
            <span>{dayOfWeek} · {fmtDate(today)}</span>
          </div>
        </div>

        {/* Daily praise from Claude */}
        <DailyPraiseCard />

        {/* Weather */}
        <WeatherCard />

        {/* Countdown + streak */}
        <div className="grid grid-cols-2 gap-6 sm:gap-10 mb-8 stagger-in delay-3">
          <div>
            <div className="text-xs sm:text-sm uppercase tracking-[0.24em] john-muted mb-3">Days until Boston</div>
            <div className="flex items-baseline gap-3">
              <div className="display text-7xl sm:text-9xl font-medium leading-none number-glow tabular">{daysToGo}</div>
              <div className="display text-xl sm:text-2xl italic john-muted">{daysToGo === 1 ? 'day' : 'days'}</div>
            </div>
            <div className="mt-2 text-xs john-muted tabular">{fmtDate(config.retreatDate)} · the mat meets the plane</div>
          </div>
          <div className="text-right">
            <div className="text-xs sm:text-sm uppercase tracking-[0.24em] john-muted mb-3">Streak</div>
            <div className="flex items-baseline gap-3 justify-end">
              <div className="display text-7xl sm:text-9xl font-medium leading-none john-accent number-glow tabular">{streak}</div>
              <div className="display text-xl sm:text-2xl italic john-muted">{streak === 1 ? 'morning' : 'mornings'}</div>
            </div>
            <div className="mt-2 text-xs john-muted">
              {streak === 0 ? 'every chain starts at zero'
                : streak < 3 ? 'a chain is forming'
                : streak < 7 ? 'chain is holding'
                : 'you are the kind of person who does this now'}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="stagger-in delay-4 mb-10">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] john-muted mb-2 tabular">
            <span>Day {elapsedDays} of {totalRunwayDays}</span>
            <span>{progressPct}% elapsed</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="rule mb-10" />

        {/* MORNING */}
        <div className="mb-8 stagger-in delay-5">
          <Eyebrow>Morning · {fmtDate(today)}</Eyebrow>
          {todayIntention ? (
            <div className="p-6 john-card">
              <div className="display text-xl sm:text-2xl mb-3">Intention: {todayIntention.mainIntention}</div>
              {todayIntention.anticipatedUrge && (
                <div className="mt-4 pt-4 rule">
                  <div className="text-xs uppercase tracking-[0.18em] john-muted mb-1 pt-3">You predicted the urge would be</div>
                  <div className="text-lg italic">{todayIntention.anticipatedUrge}</div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                setMorningDraft({ mainIntention: '', anticipatedUrge: '', mood: 4 });
                setUiMorningCustomIntent(false);
                setUiMorningCustomUrge(false);
                goTo('morning');
              }}
              className="w-full p-6 border-2 border-dashed john-border hover-card rounded-card btn-lift text-left"
            >
              <div className="display text-xl sm:text-2xl mb-1">Set today's intention</div>
              <div className="john-muted">Three taps. Fifteen seconds.</div>
            </button>
          )}
        </div>

        {/* EVENING */}
        <div className="mb-8">
          <Eyebrow>Evening reflection</Eyebrow>
          {todayReflection ? (
            <div className="p-6 john-card">
              <div className="display text-xl sm:text-2xl mb-2">
                {todayReflection.practiced ? 'You did the thing today.' : "Today was a miss. That's data."}
              </div>
              {todayReflection.urgeWas && (
                <div className="text-lg john-muted italic mt-3">
                  Urge: {todayReflection.urgeWas}. Chose: <span className="john-accent">{todayReflection.chose}</span>.
                  {todayReflection.urgeWon ? ' (Urge won this time.)' : ''}
                </div>
              )}
              {todayReflection.note && <div className="text-base mt-3">{todayReflection.note}</div>}
            </div>
          ) : (
            <button
              onClick={() => {
                setEveningDraft({ practiced: null, grewBeyond: false, urgeWas: '', chose: '', urgeWon: true, mood: 4, note: '' });
                setUiEveningHadUrge(false);
                setUiEveningCustomUrge(false);
                setUiEveningCustomChose(false);
                setUiEveningShowNote(false);
                goTo('evening');
              }}
              className="w-full p-6 border-2 border-dashed john-border hover-card rounded-card btn-lift text-left"
            >
              <div className="display text-xl sm:text-2xl mb-1">Log the day</div>
              <div className="john-muted">One tap for the mat. The rest is optional. Under a minute.</div>
            </button>
          )}
        </div>

        {/* RECIPE */}
        <div className="mb-8">
          <Eyebrow>Your recipe</Eyebrow>
          <div className="p-6 john-card">
            <div className="display text-lg sm:text-xl leading-relaxed">
              After I <span className="john-accent italic">{resolvedAnchor.toLowerCase()}</span>,
              I will <span className="john-accent italic">{config.abilityText.toLowerCase().replace(/\.$/, '')}</span>,
              and I will <span className="john-accent italic">{resolvedCelebration.toLowerCase()}</span>.
            </div>
            <div className="rule my-4" />
            <div className="display text-base sm:text-lg italic john-muted">{resolvedIdentity}</div>
          </div>
        </div>

        {/* 14-day strip */}
        {reflections.length > 0 && (
          <div className="mb-8">
            <Eyebrow>The last two weeks</Eyebrow>
            <div className="flex gap-1 mb-3">
              {Array.from({ length: 14 }).map((_, i) => {
                const d = new Date(today + 'T00:00:00');
                d.setDate(d.getDate() - (13 - i));
                const ds = d.toISOString().slice(0, 10);
                const entry = reflections.find(l => l.date === ds);
                let color = '#E8DDC8';
                if (entry?.practiced) color = '#8B3A2F';
                else if (entry && entry.practiced === false) color = '#C9BBA5';
                return (
                  <div key={ds}
                    title={`${fmtDate(ds)}${entry ? (entry.practiced ? ' · practiced' : ' · missed') : ''}`}
                    className="flex-1 h-10 smooth rounded-sm"
                    style={{ backgroundColor: color }} />
                );
              })}
            </div>
            <div className="flex justify-between text-xs john-muted tabular">
              <span>14 days ago</span>
              <span>{practicedCount} / {reflections.length} logged mornings practiced</span>
              <span>today</span>
            </div>
          </div>
        )}

        {/* Insights */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Eyebrow>Patterns · generated by Claude</Eyebrow>
            <button
              onClick={generateInsight}
              disabled={insightLoading}
              className="text-xs uppercase tracking-[0.18em] john-accent smooth hover:text-black disabled:opacity-40"
            >
              {insightLoading ? 'Reading your data…' : '+ Generate'}
            </button>
          </div>
          {insights.length === 0 ? (
            <div className="john-muted italic text-base">
              Once you've logged a few days, Claude will look for one pattern you might not be seeing.
            </div>
          ) : (
            <div className="space-y-3">
              {[...insights].reverse().slice(0, 3).map(ins => (
                <div key={ins.id} className="p-5 john-card">
                  <div className="text-xs uppercase tracking-[0.18em] john-muted mb-2 tabular">{fmtDateTime(ins.timestamp)}</div>
                  <div className={`text-base leading-relaxed ${ins.error ? 'john-muted italic' : ''}`}>{ins.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Companion teaser */}
        <div className="mb-10">
          <button
            onClick={() => goTo('chat')}
            className="w-full p-6 border john-border hover-card rounded-card btn-lift text-left"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-start gap-3">
                <div className="avatar-dot avatar-dot-claude mt-1">C</div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] john-accent mb-2">Companion</div>
                  <div className="display text-xl sm:text-2xl">Ask Claude something</div>
                  <div className="john-muted mt-1">
                    {chatHistory.length === 0
                      ? 'It has your clinical context, the books, and your logs.'
                      : `${chatHistory.filter(m => m.role === 'user').length} conversation${chatHistory.filter(m => m.role === 'user').length === 1 ? '' : 's'} so far.`}
                  </div>
                </div>
              </div>
              <div className="text-2xl john-accent">→</div>
            </div>
          </button>
        </div>

        {/* EVENLY-SPACED bottom buttons — grid with 3 equal columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t john-border">
          <button
            onClick={() => goTo('cheatsheet')}
            className="px-5 py-3 text-sm uppercase tracking-[0.18em] rounded-btn btn-lift border john-border john-ink hover-card hover:warm-shadow-md"
          >When the urge hits</button>
          <button
            onClick={() => goTo('timeline')}
            className="px-5 py-3 text-sm uppercase tracking-[0.18em] rounded-btn btn-lift border john-border john-ink hover-card hover:warm-shadow-md"
          >Timeline</button>
          <button
            onClick={() => goTo('welcome')}
            className="px-5 py-3 text-sm uppercase tracking-[0.18em] rounded-btn btn-lift border john-border john-ink hover-card hover:warm-shadow-md"
          >Revise recipe</button>
        </div>
      </Shell>
    );
  }

  // ============================================================
  // MORNING — 3-tap sentence completion
  // ============================================================
  if (phase === 'morning') {
    const moods = ['heavy','low','meh','steady','up','on','lit'];
    const intentionStarters = [
      "The mat. That's the deal.",
      'Sending the hard message',
      'Showing up cleanly',
      'The hard conversation',
      'One clean morning',
      'Not negotiating with myself',
      'Just being in my body today',
    ];
    const urgeStarters = [
      "I'm too tired",
      "I'll do it tomorrow",
      "I'm getting sick",
      "It doesn't matter today",
      "Just this once won't matter",
      "I need coffee first",
      "Not feeling it",
    ];
    const intentionIsCustom = morningDraft.mainIntention && !intentionStarters.includes(morningDraft.mainIntention);
    const urgeIsCustom = morningDraft.anticipatedUrge && !urgeStarters.includes(morningDraft.anticipatedUrge);

    return (
      <Shell>
        <Eyebrow>This morning · {fmtDate(today)}</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-2 font-medium">Three taps.</h1>
        <p className="john-muted text-lg mb-10">Fifteen seconds. Then your day starts.</p>

        {/* Intention */}
        <div className="mb-10">
          <div className="display text-2xl sm:text-3xl leading-snug mb-5">
            Today I'm moving toward{' '}
            <span className={morningDraft.mainIntention ? 'john-accent italic' : 'john-muted italic'}>
              {morningDraft.mainIntention ? morningDraft.mainIntention.toLowerCase().replace(/\.$/, '') : '___________'}
            </span>.
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {intentionStarters.map(s => (
              <Chip key={s} active={morningDraft.mainIntention === s}
                onClick={() => { setMorningDraft({ ...morningDraft, mainIntention: s }); setUiMorningCustomIntent(false); }}
              >{s}</Chip>
            ))}
            <button
              onClick={() => setUiMorningCustomIntent(true)}
              className={`px-4 py-2 border text-base rounded-chip chip-tactile ${
                uiMorningCustomIntent || intentionIsCustom ? 'john-accent-bg text-white border-transparent' : 'john-border john-muted hover-card'
              }`}
            >+ something else</button>
          </div>
          {(uiMorningCustomIntent || intentionIsCustom) && (
            <input
              type="text" autoFocus
              value={intentionIsCustom ? morningDraft.mainIntention : ''}
              onChange={e => setMorningDraft({ ...morningDraft, mainIntention: e.target.value })}
              placeholder="Today I'm moving toward…"
              className="w-full px-5 py-3 border john-border john-bg body text-lg focus:outline-none focus:border-black smooth rounded-btn fade-in"
            />
          )}
        </div>

        {/* Urge */}
        <div className="mb-10">
          <div className="display text-2xl sm:text-3xl leading-snug mb-5">
            My mind's going to try to sell me{' '}
            <span className={morningDraft.anticipatedUrge ? 'john-accent italic' : 'john-muted italic'}>
              {morningDraft.anticipatedUrge ? `"${morningDraft.anticipatedUrge}"` : '___________'}
            </span>.
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {urgeStarters.map(s => (
              <Chip key={s} active={morningDraft.anticipatedUrge === s}
                onClick={() => { setMorningDraft({ ...morningDraft, anticipatedUrge: s }); setUiMorningCustomUrge(false); }}
              >{s}</Chip>
            ))}
            <button
              onClick={() => setUiMorningCustomUrge(true)}
              className={`px-4 py-2 border text-base rounded-chip chip-tactile ${
                uiMorningCustomUrge || urgeIsCustom ? 'john-accent-bg text-white border-transparent' : 'john-border john-muted hover-card'
              }`}
            >+ something else</button>
          </div>
          {(uiMorningCustomUrge || urgeIsCustom) && (
            <input
              type="text" autoFocus
              value={urgeIsCustom ? morningDraft.anticipatedUrge : ''}
              onChange={e => setMorningDraft({ ...morningDraft, anticipatedUrge: e.target.value })}
              placeholder="What's the story your mind's going to tell?"
              className="w-full px-5 py-3 border john-border john-bg body text-lg focus:outline-none focus:border-black smooth rounded-btn fade-in"
            />
          )}
          <p className="text-sm john-muted italic mt-3">Naming it in advance takes half its weight away.</p>
        </div>

        {/* Mood */}
        <div className="mb-12">
          <div className="text-sm uppercase tracking-[0.18em] john-muted mb-3">Mood · {moods[morningDraft.mood - 1]}</div>
          <div className="flex gap-2">
            {moods.map((m, idx) => (
              <button key={m}
                onClick={() => setMorningDraft({ ...morningDraft, mood: idx + 1 })}
                className={`flex-1 py-3 border rounded-btn chip-tactile text-sm ${morningDraft.mood === idx + 1 ? 'john-accent-bg text-white border-transparent' : 'john-border hover-card'}`}
              >{m}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <BigButton variant="ghost" onClick={() => goTo('dashboard')}>Cancel</BigButton>
          <BigButton onClick={saveMorning} disabled={!morningDraft.mainIntention}>Save →</BigButton>
        </div>
      </Shell>
    );
  }

  // ============================================================
  // EVENING
  // ============================================================
  if (phase === 'evening') {
    const moods = ['drained','low','meh','steady','up','on','lit'];
    const urgeStarters = ['Skip', 'Scroll', 'Eat', 'Avoid', 'Cancel', 'Numb out', 'Stay in bed', 'Pick a fight'];
    const choseStarters = ['Did it anyway', 'Showed up', 'Sent it', 'Stayed in it', 'Moved', 'Spoke up', 'Paused'];
    const urgeIsCustom = eveningDraft.urgeWas && !urgeStarters.includes(eveningDraft.urgeWas);
    const choseIsCustom = eveningDraft.chose && !choseStarters.includes(eveningDraft.chose);
    const matState = eveningDraft.practiced === true && eveningDraft.grewBeyond ? 'grew'
      : eveningDraft.practiced === true ? 'done'
      : eveningDraft.practiced === false ? 'missed' : null;

    return (
      <Shell>
        <Eyebrow>Tonight · {fmtDate(today)}</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-2 font-medium">The day in under a minute.</h1>
        <p className="john-muted text-lg mb-10">One tap for the mat. The rest is optional.</p>

        {/* Mat */}
        <div className="mb-10">
          <div className="display text-2xl sm:text-3xl leading-snug mb-5">
            The mat today{' '}
            <span className={matState ? 'john-accent italic' : 'john-muted italic'}>
              {matState === 'grew' ? 'came out and grew past the tiny version' :
               matState === 'done' ? 'came out, did the recipe' :
               matState === 'missed' ? "didn't come out" : '___________'}
            </span>.
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {[
              { key: 'done', practiced: true, grewBeyond: false, title: 'Came out. Did the recipe.', sub: "The tiny version. That's the contract." },
              { key: 'grew', practiced: true, grewBeyond: true, title: 'Grew past the tiny version.', sub: 'The body kept going on its own.' },
              { key: 'missed', practiced: false, grewBeyond: false, title: 'Not today.', sub: "That's data, not a verdict." },
            ].map(o => (
              <button key={o.key}
                onClick={() => setEveningDraft({ ...eveningDraft, practiced: o.practiced, grewBeyond: o.grewBeyond })}
                className={`flex-1 px-5 py-4 border rounded-btn btn-lift text-left ${
                  matState === o.key ? 'john-accent-bg text-white border-transparent warm-shadow-sm' : 'john-border hover-card'
                }`}
              >
                <div className="body text-lg font-medium">{o.title}</div>
                <div className={`text-sm mt-1 ${matState === o.key ? 'opacity-80' : 'john-muted'}`}>{o.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Urge moment — collapsed by default */}
        <div className="mb-10">
          <div className="text-sm uppercase tracking-[0.18em] john-muted mb-3">Urge moment today?</div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setUiEveningHadUrge(false);
                setEveningDraft({ ...eveningDraft, urgeWas: '', chose: '', urgeWon: true });
              }}
              className={`flex-1 px-4 py-3 border rounded-btn chip-tactile text-base ${
                !uiEveningHadUrge && !eveningDraft.urgeWas ? 'john-accent-bg text-white border-transparent' : 'john-border hover-card'
              }`}
            >None today</button>
            <button
              onClick={() => setUiEveningHadUrge(true)}
              className={`flex-1 px-4 py-3 border rounded-btn chip-tactile text-base ${
                uiEveningHadUrge || eveningDraft.urgeWas ? 'john-accent-bg text-white border-transparent' : 'john-border hover-card'
              }`}
            >Had one</button>
          </div>
          {(uiEveningHadUrge || eveningDraft.urgeWas) && (
            <div className="space-y-5 fade-in p-5 john-card">
              <div>
                <div className="display text-lg sm:text-xl leading-snug mb-3">
                  My urge was to{' '}
                  <span className={eveningDraft.urgeWas ? 'john-accent italic' : 'john-muted italic'}>
                    {eveningDraft.urgeWas ? eveningDraft.urgeWas.toLowerCase() : '_____'}
                  </span>.
                </div>
                <div className="flex flex-wrap gap-2">
                  {urgeStarters.map(s => (
                    <Chip key={s} active={eveningDraft.urgeWas === s}
                      onClick={() => { setEveningDraft({ ...eveningDraft, urgeWas: s }); setUiEveningCustomUrge(false); }}
                    >{s}</Chip>
                  ))}
                  <button
                    onClick={() => setUiEveningCustomUrge(true)}
                    className={`px-4 py-2 border text-base rounded-chip chip-tactile ${
                      uiEveningCustomUrge || urgeIsCustom ? 'john-accent-bg text-white border-transparent' : 'john-border john-muted hover-card'
                    }`}
                  >+ other</button>
                </div>
                {(uiEveningCustomUrge || urgeIsCustom) && (
                  <input type="text" autoFocus
                    value={urgeIsCustom ? eveningDraft.urgeWas : ''}
                    onChange={e => setEveningDraft({ ...eveningDraft, urgeWas: e.target.value })}
                    placeholder="My urge was to…"
                    className="w-full mt-3 px-4 py-2 border john-border john-bg body text-base focus:outline-none focus:border-black smooth rounded-btn fade-in" />
                )}
              </div>
              <div>
                <div className="display text-lg sm:text-xl leading-snug mb-3">
                  I{' '}
                  <span className={eveningDraft.chose ? 'john-accent italic' : 'john-muted italic'}>
                    {eveningDraft.chose ? eveningDraft.chose.toLowerCase() : '_____'}
                  </span>.
                </div>
                <div className="flex flex-wrap gap-2">
                  {choseStarters.map(s => (
                    <Chip key={s} active={eveningDraft.chose === s}
                      onClick={() => { setEveningDraft({ ...eveningDraft, chose: s, urgeWon: false }); setUiEveningCustomChose(false); }}
                    >{s}</Chip>
                  ))}
                  <button
                    onClick={() => setUiEveningCustomChose(true)}
                    className={`px-4 py-2 border text-base rounded-chip chip-tactile ${
                      uiEveningCustomChose || choseIsCustom ? 'john-accent-bg text-white border-transparent' : 'john-border john-muted hover-card'
                    }`}
                  >+ other</button>
                </div>
                {(uiEveningCustomChose || choseIsCustom) && (
                  <input type="text" autoFocus
                    value={choseIsCustom ? eveningDraft.chose : ''}
                    onChange={e => setEveningDraft({ ...eveningDraft, chose: e.target.value })}
                    placeholder="I…"
                    className="w-full mt-3 px-4 py-2 border john-border john-bg body text-base focus:outline-none focus:border-black smooth rounded-btn fade-in" />
                )}
              </div>
              {eveningDraft.urgeWas && eveningDraft.chose && (
                <div className="pt-2 fade-in">
                  <div className="text-sm uppercase tracking-[0.18em] john-muted mb-2">Who won this one?</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEveningDraft({ ...eveningDraft, urgeWon: false })}
                      className={`flex-1 py-2 border rounded-btn chip-tactile text-sm ${!eveningDraft.urgeWon ? 'john-accent-bg text-white border-transparent' : 'john-border hover-card'}`}
                    >I did</button>
                    <button
                      onClick={() => setEveningDraft({ ...eveningDraft, urgeWon: true })}
                      className={`flex-1 py-2 border rounded-btn chip-tactile text-sm ${eveningDraft.urgeWon ? 'john-accent-bg text-white border-transparent' : 'john-border hover-card'}`}
                    >The urge did</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mood */}
        <div className="mb-8">
          <div className="text-sm uppercase tracking-[0.18em] john-muted mb-3">Mood · {moods[eveningDraft.mood - 1]}</div>
          <div className="flex gap-2">
            {moods.map((m, idx) => (
              <button key={m}
                onClick={() => setEveningDraft({ ...eveningDraft, mood: idx + 1 })}
                className={`flex-1 py-3 border rounded-btn chip-tactile text-sm ${eveningDraft.mood === idx + 1 ? 'john-accent-bg text-white border-transparent' : 'john-border hover-card'}`}
              >{m}</button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="mb-10">
          {!uiEveningShowNote && !eveningDraft.note ? (
            <button onClick={() => setUiEveningShowNote(true)} className="text-sm john-muted smooth hover:text-black">
              + add a note
            </button>
          ) : (
            <div className="fade-in">
              <div className="text-sm uppercase tracking-[0.18em] john-muted mb-3">Note · optional</div>
              <textarea
                value={eveningDraft.note}
                onChange={e => setEveningDraft({ ...eveningDraft, note: e.target.value })}
                rows={3}
                placeholder="A sentence. A curse word. A noticing."
                className="w-full px-5 py-3 border john-border john-bg body text-lg focus:outline-none focus:border-black smooth rounded-btn resize-none"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <BigButton variant="ghost" onClick={() => goTo('dashboard')}>Cancel</BigButton>
          <BigButton onClick={saveEvening} disabled={eveningDraft.practiced === null}>Save the day →</BigButton>
        </div>
      </Shell>
    );
  }

  // ============================================================
  // COMPANION — REDESIGNED CHAT
  // ============================================================
  if (phase === 'chat') {
    const quickStarts = [
      { label: "I'm about to skip", prompt: "I'm about to skip. Talk me out of it." },
      { label: "Why am I doing this", prompt: "Why am I doing this again? Remind me." },
      { label: "What Jonathan said about fear", prompt: 'What did Jonathan say about fear-based operating?' },
      { label: "Remind me of the recipe", prompt: "Remind me what the recipe is and why it's that small." },
      { label: "What's my pattern", prompt: "What does my pattern look like so far?" },
      { label: "Feeling overwhelmed", prompt: "The feeling is bigger than the framework right now." },
    ];

    const contextChips = [
      { label: `Recipe: ${config.abilityText?.toLowerCase().replace(/\.$/, '') || 'not set'}`, type: 'recipe' },
      { label: `Boston in ${daysToGo}d`, type: 'countdown' },
      { label: `${reflections.length} days logged`, type: 'data' },
      { label: `${streak}-day streak`, type: 'streak' },
    ];

    return (
      <Shell showNav>
        {/* Header */}
        <div className="mb-6 stagger-in">
          <div className="flex items-center gap-4 mb-3">
            <div className="avatar-dot avatar-dot-claude" style={{ width: 44, height: 44, fontSize: 18 }}>C</div>
            <div>
              <h1 className="display text-3xl sm:text-4xl font-medium leading-tight">Companion</h1>
              <p className="john-muted text-sm">Claude, built on your context — not a therapist, a thinking partner between sessions.</p>
            </div>
          </div>
        </div>

        {/* Context chips — show what Claude knows */}
        <div className="mb-6 stagger-in delay-1">
          <div className="text-xs uppercase tracking-[0.22em] john-muted mb-2">What I know</div>
          <div className="flex flex-wrap gap-2">
            {contextChips.map((c, i) => (
              <div key={i} className="text-xs px-3 py-1.5 border john-border rounded-chip bg-white/50 john-muted tabular">
                {c.label}
              </div>
            ))}
          </div>
        </div>

        {/* Empty state — suggestion cards */}
        {chatHistory.length === 0 && !chatLoading && (
          <div className="mb-6 stagger-in delay-2">
            <div className="text-xs uppercase tracking-[0.22em] john-muted mb-3">Start here, or type your own</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickStarts.map((q, i) => (
                <button
                  key={q.prompt}
                  onClick={() => sendChatMessage(q.prompt)}
                  className="companion-suggestion p-4 text-left"
                  style={{ animationDelay: `${200 + i * 60}ms` }}
                >
                  <div className="text-xs uppercase tracking-[0.18em] john-accent mb-1.5">{q.label}</div>
                  <div className="text-sm john-muted">"{q.prompt}"</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {chatHistory.length > 0 && (
          <div className="mb-6 space-y-4">
            {chatHistory.length > 0 && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={clearChat}
                  className="text-xs uppercase tracking-[0.18em] john-muted smooth hover:text-black"
                >Clear conversation</button>
              </div>
            )}
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end slide-in-right' : 'slide-in-left'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="avatar-dot avatar-dot-claude">C</div>
                  </div>
                )}
                <div className={`max-w-[78%] px-5 py-3.5 ${
                  msg.role === 'user' ? 'companion-bubble-user' :
                  msg.error ? 'border john-border john-muted italic rounded-xl' : 'companion-bubble-claude'
                }`}>
                  <div className="text-base leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  <div className={`text-[10px] uppercase tracking-[0.18em] mt-2 ${msg.role === 'user' ? 'text-white opacity-70' : 'john-muted'} tabular`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="avatar-dot avatar-dot-user">J</div>
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-3 slide-in-left">
                <div className="flex-shrink-0 mt-1">
                  <div className="avatar-dot avatar-dot-claude">C</div>
                </div>
                <div className="companion-bubble-claude px-5 py-4">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full john-accent-bg pulse" />
                    <div className="w-2 h-2 rounded-full john-accent-bg pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 rounded-full john-accent-bg pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Input — sticky bottom */}
        <div className="sticky bottom-4 pt-4 stagger-in delay-3">
          <div className="companion-input p-2 flex items-end gap-2">
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
              placeholder="Ask Claude something…"
              rows={1}
              className="flex-1 px-3 py-2 bg-transparent body text-base focus:outline-none resize-none"
              style={{ minHeight: 42, maxHeight: 120 }}
            />
            <button
              onClick={() => sendChatMessage()}
              disabled={!chatInput.trim() || chatLoading}
              className="px-5 py-2.5 john-accent-bg text-white text-sm uppercase tracking-[0.18em] rounded-btn btn-lift smooth hover-accent disabled:opacity-30"
            >Send</button>
          </div>
          <p className="text-xs john-muted italic mt-2 text-center">
            Enter to send · Shift+Enter for new line · Claude has your context
          </p>
        </div>
      </Shell>
    );
  }

  // ============================================================
  // TIMELINE
  // ============================================================
  if (phase === 'timeline') {
    const eventLabel = {
      app_opened: 'Opened the app',
      screen_viewed: 'Moved to screen',
      diagnostic_answered: 'Answered diagnostic',
      config_saved: 'Saved recipe',
      morning_intention_set: 'Set morning intention',
      evening_reflection_saved: 'Logged evening',
      chat_exchange: 'Talked to Claude',
      insight_generated: 'Pattern insight generated',
    };
    const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return (
      <Shell showNav>
        <Eyebrow>Timeline · full engagement log</Eyebrow>
        <h1 className="display text-3xl sm:text-4xl mb-4 font-medium">{events.length} events on the record.</h1>
        <p className="john-muted mb-8">
          Everything you do in this tool is logged. Every intention, every urge-moment, every question asked, every miss, every morning the mat came out.
        </p>
        <div className="space-y-1">
          {sorted.slice(0, 200).map(ev => (
            <div key={ev.id} className="flex items-start gap-4 p-3 border-b john-border">
              <div className="mono text-xs john-muted w-48 shrink-0 tabular">{fmtDateTime(ev.timestamp)}</div>
              <div className="flex-1">
                <div className="text-sm font-medium">{eventLabel[ev.type] || ev.type}</div>
                {ev.data && Object.keys(ev.data).length > 0 && (
                  <div className="text-xs john-muted mt-1 mono">
                    {Object.entries(ev.data).map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {events.length > 200 && (
          <div className="john-muted italic mt-6 text-sm">Showing the most recent 200 of {events.length}.</div>
        )}
        <div className="mt-8">
          <BigButton variant="ghost" onClick={() => goTo('dashboard')}>← Dashboard</BigButton>
        </div>
      </Shell>
    );
  }

  // ============================================================
  // CHEATSHEET
  // ============================================================
  if (phase === 'cheatsheet') {
    return (
      <Shell showNav>
        <Eyebrow>When the urge hits to skip</Eyebrow>
        <h1 className="display text-4xl sm:text-5xl leading-[1.1] mb-10 font-medium">
          Read this. Then do the tiny thing anyway.
        </h1>
        <div className="space-y-6 mb-10">
          {[
            { t: 'The feeling you\'re having right now is a feeling.', b: 'It is not evidence. It is not a diagnosis. It is weather. It will pass in four to seven minutes whether you practice or not. The only question is whether you practice during it.' },
            { t: 'You didn\'t sign up for fifteen minutes.', b: `You signed up for ${config.abilityText.toLowerCase()} The contract is extremely small. Anything more is extra credit.` },
            { t: 'Future John is not coming to save you.', b: 'Future John is the same guy. He wakes up with the same resistance on May 1st. The only difference between him and you is whether this morning happened.' },
            { t: 'You already know who you are.', b: resolvedIdentity, isIdentity: true },
          ].map((c, i) => (
            <div key={i} className="p-6 john-card stagger-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="display text-xl sm:text-2xl mb-2">{c.t}</div>
              <div className={`text-lg ${c.isIdentity ? 'display italic john-accent' : 'john-muted'}`}>{c.b}</div>
            </div>
          ))}
          <div className="p-6 border-2 rounded-card stagger-in" style={{ borderColor: '#8B3A2F', animationDelay: '320ms' }}>
            <div className="display text-xl sm:text-2xl mb-2 john-accent">Contrary to your action urge.</div>
            <div className="text-lg john-muted">
              This is the one you picked. The move is the opposite of what your urge wants. Not heroic. Just opposite.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <BigButton onClick={() => goTo('chat')}>Talk to the companion</BigButton>
          <BigButton variant="ghost" onClick={() => goTo('dashboard')}>Back to the runway</BigButton>
        </div>
      </Shell>
    );
  }

  return null;
}
