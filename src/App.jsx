import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart, Eye, Sparkles, Copy, RefreshCw, Trophy, Skull, Loader2,
  ArrowRight, X, ChevronLeft, ChevronRight, Hand
} from 'lucide-react';
import { storage } from './firebase';

// ==================== CONSTANTS ====================
const STARTING_HEARTS = 3;
const STARTING_HELPERS = 3;
const PEEK_COUNT = 2;
const MAX_LEVEL = 10;
const DRAG_PUBLISH_INTERVAL = 300;
const AUTO_SCROLL_EDGE = 80;
const AUTO_SCROLL_SPEED = 16;

// ==================== HELPERS ====================
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardsForLevel(level) { return level + 2; }

function bonusForLevel(level) {
  if (level === 2) return { helpers: 1 };
  if (level === 3) return { hearts: 1 };
  if (level === 5) return { helpers: 1, hearts: 1 };
  if (level === 7) return { helpers: 1 };
  if (level === 9) return { hearts: 1 };
  return {};
}

function dealRound(level) {
  const deck = shuffleArray(Array.from({ length: 100 }, (_, i) => i + 1));
  const n = cardsForLevel(level);
  const total = n * 2;
  return {
    p1Hand: deck.slice(0, n).sort((a, b) => a - b),
    p2Hand: deck.slice(n, n * 2).sort((a, b) => a - b),
    sequence: Array.from({ length: total }, () => null),
    revealedValues: [],
    peeksUsed: { p1: 0, p2: 0 },
    result: null,
    p1Dragging: null,
    p2Dragging: null,
  };
}

function createInitialState() {
  return {
    phase: 'waiting',
    level: 1,
    hearts: STARTING_HEARTS,
    helpers: STARTING_HELPERS,
    players: { p1: true, p2: false },
    ...dealRound(1),
    updatedAt: Date.now(),
  };
}

// ==================== MAIN APP ====================
export default function App() {
  const [screen, setScreen] = useState('home');
  const [playerId, setPlayerId] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revealIdx, setRevealIdx] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [lastBonus, setLastBonus] = useState(null);
  const [peekMode, setPeekMode] = useState({ active: false, picksLeft: 0 });

  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const stateRef = useRef(null);
  dragRef.current = drag;
  const lastPublishRef = useRef(0);
  const writeVersionRef = useRef(0);
  const seqScrollRef = useRef(null);

  const roomCodeRef = useRef('');
  roomCodeRef.current = roomCode;
  const playerIdRef = useRef(null);
  playerIdRef.current = playerId;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isDragging = !!drag;

  // ---------- REALTIME SUBSCRIPTION (แทน polling เดิม) ----------
  useEffect(() => {
    if (!roomCode) return;
    const unsubscribe = storage.subscribe(`mindlink4:room:${roomCode}`, (r) => {
      if (!r) return;
      try {
        const s = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        setState(s);
      } catch (e) {
        console.error('subscribe parse error:', e);
      }
    });
    return () => unsubscribe();
  }, [roomCode]);

  // ---------- SCREEN TRANSITIONS ----------
  useEffect(() => {
    if (!state) return;
    if (state.phase === 'playing' && (screen === 'waiting' || screen === 'reveal')) {
      setScreen('playing');
      setRevealIdx(-1);
    }
    if (state.phase === 'reveal' && screen !== 'reveal') {
      setScreen('reveal');
      setRevealIdx(0);
    }
    if (state.phase === 'end' && screen !== 'end') setScreen('end');
  }, [state, screen]);

  useEffect(() => {
    setPeekMode({ active: false, picksLeft: 0 });
  }, [state?.level, state?.phase]);

  // ---------- REVEAL ANIMATION ----------
  useEffect(() => {
    if (screen !== 'reveal' || !state) return;
    if (revealIdx < 0 || revealIdx >= state.sequence.length) return;
    const t = setTimeout(() => setRevealIdx(i => i + 1), 700);
    return () => clearTimeout(t);
  }, [revealIdx, screen, state]);

  // ---------- LOCK SCROLL/TOUCH DURING DRAG ----------
  useEffect(() => {
    if (!isDragging) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isDragging]);

  // ---------- STORAGE ----------
  const readLatest = async () => {
    try {
      const r = await storage.get(`mindlink4:room:${roomCode}`);
      if (!r) return stateRef.current;
      return typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
    } catch {
      return stateRef.current;
    }
  };
  const readLatestByRef = async () => {
    if (!roomCodeRef.current) return stateRef.current;
    try {
      const r = await storage.get(`mindlink4:room:${roomCodeRef.current}`);
      if (!r) return stateRef.current;
      return typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
    } catch {
      return stateRef.current;
    }
  };
  const writeState = async (ns) => {
    const withTime = { ...ns, updatedAt: Date.now() };
    await storage.set(`mindlink4:room:${roomCode}`, withTime);
    setState(withTime);
  };

  // ---------- ROOM ----------
  const createRoom = async () => {
    setError(''); setLoading(true);
    try {
      let code;
      for (let i = 0; i < 5; i++) {
        code = generateRoomCode();
        try {
          const e = await storage.get(`mindlink4:room:${code}`);
          if (!e) break;
        } catch { break; }
      }
      const init = createInitialState();
      await storage.set(`mindlink4:room:${code}`, init);
      setRoomCode(code); setPlayerId('p1'); setState(init); setScreen('waiting');
    } catch (e) { setError('สร้างห้องไม่สำเร็จ: ' + e.message); }
    finally { setLoading(false); }
  };

  const joinRoom = async () => {
    setError('');
    if (!inputCode || inputCode.length !== 4) {
      setError('กรุณาใส่รหัสห้อง 4 ตัวอักษร'); return;
    }
    setLoading(true);
    try {
      const code = inputCode.toUpperCase();
      let s = null;
      try {
        const r = await storage.get(`mindlink4:room:${code}`);
        s = r ? JSON.parse(r.value) : null;
      } catch {}
      if (!s) { setError('ไม่พบห้องนี้'); setLoading(false); return; }
      if (s.players.p2) { setError('ห้องเต็มแล้ว'); setLoading(false); return; }
      const ns = { ...s, players: { ...s.players, p2: true }, phase: 'playing' };
      await storage.set(`mindlink4:room:${code}`, { ...ns, updatedAt: Date.now() });
      setRoomCode(code); setPlayerId('p2'); setState(ns); setScreen('playing');
    } catch (e) { setError('เข้าห้องไม่สำเร็จ: ' + e.message); }
    finally { setLoading(false); }
  };

  // ---------- HIT TESTING (rect-based, very forgiving) ----------
  const computeHover = useCallback((clientX, clientY) => {
    // 1. Check sequence container area — snap to nearest slot horizontally
    const seqContainer = document.querySelector('[data-seq-container]');
    if (seqContainer) {
      const cr = seqContainer.getBoundingClientRect();
      // Generous vertical band
      if (clientY >= cr.top - 40 && clientY <= cr.bottom + 30) {
        const slots = seqContainer.querySelectorAll('[data-slot]');
        let nearest = null, nd = Infinity;
        for (const s of slots) {
          const r = s.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const d = Math.abs(clientX - cx);
          if (d < nd) { nd = d; nearest = s; }
        }
        if (nearest) {
          return {
            type: 'seq',
            index: parseInt(nearest.dataset.slot, 10),
            filled: nearest.dataset.filled === 'true',
          };
        }
      }
    }
    // 2. Check hand area
    const handEl = document.querySelector('[data-hand="mine"]');
    if (handEl) {
      const r = handEl.getBoundingClientRect();
      if (clientY >= r.top - 10 && clientY <= r.bottom + 40) {
        return { type: 'hand', index: null };
      }
    }
    return null;
  }, []);

  // ---------- DRAG ----------
  const publishDrag = useCallback(async (dragState, version) => {
    if (version == null) version = writeVersionRef.current;
    if (version !== writeVersionRef.current) return;
    if (!roomCodeRef.current || !playerIdRef.current) return;
    try {
      const key = playerIdRef.current === 'p1' ? 'p1Dragging' : 'p2Dragging';
      const payload = dragState ? {
        value: dragState.value,
        source: dragState.source,
        sourceIndex: dragState.sourceIndex ?? null,
        hoverType: dragState.hoverType ?? null,
        hoverIndex: dragState.hoverIndex ?? null,
      } : null;
      await storage.update(`mindlink4:room:${roomCodeRef.current}`, { [key]: payload, updatedAt: Date.now() });
    } catch (e) { console.error('[publishDrag] error', e); }
  }, []);

  const startDrag = useCallback((cardInfo, clientX, clientY) => {
    if (state?.phase !== 'playing') return;
    if (peekMode.active) return;
    writeVersionRef.current += 1;
    const currentVersion = writeVersionRef.current;
    const hover = computeHover(clientX, clientY);
    const nd = {
      ...cardInfo,
      pointerX: clientX, pointerY: clientY,
      hoverType: hover?.type ?? null,
      hoverIndex: hover?.index ?? null,
    };
    setDrag(nd);
    publishDrag(nd, currentVersion);
  }, [state?.phase, peekMode.active, computeHover, publishDrag]);

  // Handlers via refs to prevent stale closure & avoid re-attaching listeners
  const moveRef = useRef(() => {});
  const upRef = useRef(() => {});

  moveRef.current = (e) => {
    if (!dragRef.current) return;
    e.preventDefault?.();
    const hover = computeHover(e.clientX, e.clientY);
    const nd = {
      ...dragRef.current,
      pointerX: e.clientX, pointerY: e.clientY,
      hoverType: hover?.type ?? null,
      hoverIndex: hover?.index ?? null,
    };
    setDrag(nd);
    const now = Date.now();
    if (now - lastPublishRef.current > DRAG_PUBLISH_INTERVAL) {
      lastPublishRef.current = now;
      publishDrag(nd, writeVersionRef.current);
    }
  };

  upRef.current = async (e) => {
    const current = dragRef.current;
    if (!current) return;
    const hover = computeHover(e.clientX, e.clientY) ?? current;
    setDrag(null);
    writeVersionRef.current += 1;
    const commitVersion = writeVersionRef.current;
    await commitDropRef.current({
      ...current,
      hoverType: hover?.type ?? current.hoverType ?? null,
      hoverIndex: hover?.index ?? current.hoverIndex ?? null,
      version: commitVersion,
    });
  };

  const commitDropRef = useRef(async () => {});
  useEffect(() => {
    commitDropRef.current = async (info) => {
      const { value, source, sourceIndex, hoverType, hoverIndex, version } = info;
      if (version !== writeVersionRef.current) return;
      if (!roomCodeRef.current) return;

      const pid = playerIdRef.current;
      if (!pid) return;
      const handKey = pid === 'p1' ? 'p1Hand' : 'p2Hand';
      const dragKey = pid === 'p1' ? 'p1Dragging' : 'p2Dragging';
      const key = `mindlink4:room:${roomCodeRef.current}`;

      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const latest = await readLatestByRef();
        if (!latest || latest.phase !== 'playing') { await publishDrag(null, version); return; }

        const hand = [...latest[handKey]];
        const sequence = [...latest.sequence];
        let success = false;

        if (source === 'hand') {
          const i = hand.indexOf(value);
          if (i < 0) {
            // nothing to commit; just clear dragging
            const now = Date.now();
            await storage.update(key, { [dragKey]: null, updatedAt: now });
            setState({ ...latest, [dragKey]: null, updatedAt: now });
            return;
          }
          if (hoverType === 'seq'
              && typeof hoverIndex === 'number'
              && hoverIndex >= 0 && hoverIndex < sequence.length
              && sequence[hoverIndex] == null) {
            hand.splice(i, 1);
            sequence[hoverIndex] = { value, by: pid };
            success = true;
          }
        } else if (source === 'seq') {
          const cell = sequence[sourceIndex];
          if (!cell || cell.value !== value || cell.by !== pid) {
            const now = Date.now();
            await storage.update(key, { [dragKey]: null, updatedAt: now });
            setState({ ...latest, [dragKey]: null, updatedAt: now });
            return;
          }
          if (hoverType === 'seq'
              && typeof hoverIndex === 'number'
              && hoverIndex >= 0 && hoverIndex < sequence.length) {
            if (hoverIndex === sourceIndex) {
              // no-op
            } else if (sequence[hoverIndex] == null) {
              sequence[sourceIndex] = null;
              sequence[hoverIndex] = { value, by: pid };
              success = true;
            }
          } else if (hoverType === 'hand') {
            sequence[sourceIndex] = null;
            hand.push(value);
            hand.sort((a, b) => a - b);
            success = true;
          }
        }

        if (!success) {
          const now = Date.now();
          await storage.update(key, { [dragKey]: null, updatedAt: now });
          setState({ ...latest, [dragKey]: null, updatedAt: now });
          return;
        }

        // Attempt to apply only the changed fields via partial update to reduce overwrite races
        const patch = { [handKey]: hand, sequence, [dragKey]: null, updatedAt: Date.now() };
        try {
          await storage.update(key, patch);
          setState({ ...latest, ...patch });
          return;
        } catch (e) {
          // transient failure or race; retry
          continue;
        }
      }

      // If we reach here, abort gracefully by clearing dragging
      const finalLatest = await readLatestByRef();
      if (finalLatest) {
        const now = Date.now();
        await storage.update(key, { [playerIdRef.current === 'p1' ? 'p1Dragging' : 'p2Dragging']: null, updatedAt: now });
        setState({ ...finalLatest, [playerIdRef.current === 'p1' ? 'p1Dragging' : 'p2Dragging']: null, updatedAt: now });
      } else {
        await publishDrag(null, version);
      }
    };
  }, []);

  // Attach listeners ONCE per drag session (not on every pointermove)
  useEffect(() => {
    if (!isDragging) return;
    const move = (e) => moveRef.current(e);
    const up = (e) => upRef.current(e);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // Fallback: cancel drag if window loses focus
    const onBlur = () => {
      if (dragRef.current) {
        setDrag(null);
        writeVersionRef.current += 1;
        const cancelVersion = writeVersionRef.current;
        publishDrag(null, cancelVersion);
        commitDropRef.current({ ...dragRef.current, hoverType: null, hoverIndex: null, version: cancelVersion });
      }
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', onBlur);
    };
  }, [isDragging, publishDrag]);

  // Auto-scroll near edges
  useEffect(() => {
    if (!isDragging || !seqScrollRef.current) return;
    let raf;
    const step = () => {
      if (!dragRef.current || !seqScrollRef.current) return;
      const rect = seqScrollRef.current.getBoundingClientRect();
      const x = dragRef.current.pointerX;
      if (x < rect.left + AUTO_SCROLL_EDGE) seqScrollRef.current.scrollLeft -= AUTO_SCROLL_SPEED;
      else if (x > rect.right - AUTO_SCROLL_EDGE) seqScrollRef.current.scrollLeft += AUTO_SCROLL_SPEED;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isDragging]);

  // ---------- PEEK ----------
  const enterPeekMode = async () => {
    if (!state || state.phase !== 'playing' || state.helpers <= 0) return;
    if (peekMode.active) return;
    const faceDown = state.sequence.filter(c => c && !state.revealedValues.includes(c.value));
    if (faceDown.length === 0) return;
    const latest = await readLatest();
    if (!latest || latest.helpers <= 0) return;
    await writeState({
      ...latest,
      helpers: latest.helpers - 1,
      peeksUsed: { ...latest.peeksUsed, [playerId]: (latest.peeksUsed[playerId] || 0) + 1 },
    });
    setPeekMode({ active: true, picksLeft: PEEK_COUNT });
  };

  const handlePeekTap = async (slotIdx) => {
    if (!peekMode.active || peekMode.picksLeft <= 0 || !state) return;
    const cell = state.sequence[slotIdx];
    if (!cell) return;
    if (state.revealedValues.includes(cell.value)) return;
    const latest = await readLatest();
    if (!latest) return;
    const latestCell = latest.sequence[slotIdx];
    if (!latestCell) return;
    if (latest.revealedValues.includes(latestCell.value)) return;
    const newRevealed = [...latest.revealedValues, latestCell.value];
    await writeState({ ...latest, revealedValues: newRevealed });
    const newPicks = peekMode.picksLeft - 1;
    const stillFaceDown = latest.sequence.some((c) => c && !newRevealed.includes(c.value));
    if (newPicks <= 0 || !stillFaceDown) setPeekMode({ active: false, picksLeft: 0 });
    else setPeekMode({ active: true, picksLeft: newPicks });
  };

  const cancelPeek = () => setPeekMode({ active: false, picksLeft: 0 });

  // ---------- GAME ACTIONS ----------
  const revealNow = async () => {
    const latest = await readLatest();
    if (!latest) return;
    if (latest.sequence.some(c => c == null)) {
      setError('รอเพื่อนวางให้ครบก่อนกดยืนยัน');
      setTimeout(() => setError(''), 2500);
      return;
    }
    const vs = latest.sequence.map(c => c.value);
    const sorted = [...vs].sort((a, b) => a - b);
    const success = vs.every((v, i) => v === sorted[i]);
    await writeState({ ...latest, phase: 'reveal', result: success ? 'success' : 'fail' });
  };

  const nextRound = async () => {
    const latest = await readLatest();
    if (!latest) return;
    if (latest.result === 'success') {
      const newLevel = latest.level + 1;
      if (newLevel > MAX_LEVEL) {
        await writeState({ ...latest, phase: 'end', gameResult: 'victory' }); return;
      }
      const bonus = bonusForLevel(newLevel);
      setLastBonus(Object.keys(bonus).length ? bonus : null);
      const dealt = dealRound(newLevel);
      await writeState({
        ...latest, level: newLevel,
        hearts: latest.hearts + (bonus.hearts || 0),
        helpers: latest.helpers + (bonus.helpers || 0),
        phase: 'playing', ...dealt,
      });
    } else {
      const nh = latest.hearts - 1;
      if (nh <= 0) {
        await writeState({ ...latest, hearts: 0, phase: 'end', gameResult: 'defeat' }); return;
      }
      setLastBonus(null);
      await writeState({ ...latest, hearts: nh, phase: 'playing', ...dealRound(latest.level) });
    }
  };

  const restart = () => {
    setRoomCode(''); setPlayerId(null); setState(null);
    setScreen('home'); setError(''); setInputCode('');
    setRevealIdx(-1); setLastBonus(null); setDrag(null);
    setPeekMode({ active: false, picksLeft: 0 });
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ---------- RENDER ----------
  return (
    <>
      <style>{styles}</style>
      <div className="min-h-screen w-full bg-midnight text-amber-50 font-body relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none starfield" />
        <div className="relative z-10">
          {screen === 'home' && (
            <HomeScreen
              onCreate={createRoom} onJoin={joinRoom}
              inputCode={inputCode} setInputCode={setInputCode}
              error={error} loading={loading}
            />
          )}
          {screen === 'waiting' && (
            <WaitingScreen roomCode={roomCode} onCopy={copyCode} copied={copied} onCancel={restart} />
          )}
          {screen === 'playing' && state && (
            <GameScreen
              state={state} playerId={playerId}
              drag={drag} startDrag={startDrag}
              onPeekStart={enterPeekMode} onPeekTap={handlePeekTap} onPeekCancel={cancelPeek}
              peekMode={peekMode}
              onRevealNow={revealNow}
              lastBonus={lastBonus} onClearBonus={() => setLastBonus(null)}
              seqScrollRef={seqScrollRef}
            />
          )}
          {screen === 'reveal' && state && (
            <RevealScreen state={state} revealIdx={revealIdx} onContinue={nextRound} playerId={playerId} />
          )}
          {screen === 'end' && state && (
            <EndScreen state={state} onRestart={restart} />
          )}
        </div>

        {drag && (
          <div
            className="pointer-events-none fixed z-50"
            style={{ left: drag.pointerX, top: drag.pointerY, transform: 'translate(-50%, -50%)' }}
          >
            <div className="card-face own-glow w-16 h-24 md:w-20 md:h-28 rounded-lg font-display text-3xl md:text-4xl font-semibold flex items-center justify-center rotate-3 scale-110 shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
              {drag.value}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ==================== SCREENS ====================

function HomeScreen({ onCreate, onJoin, inputCode, setInputCode, error, loading }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 animate-fadeIn">
      <div className="text-center mb-12 animate-float">
        <div className="text-6xl mb-3">✦</div>
        <h1 className="font-display text-5xl md:text-7xl font-semibold tracking-wide shimmer-text mb-3">สัมผัสใจ</h1>
        <div className="font-display italic text-amber-200/70 text-lg md:text-xl tracking-widest">— Mind Link —</div>
        <p className="mt-6 text-amber-100/60 max-w-md text-sm md:text-base leading-relaxed">
          เกมเรียงไพ่จากน้อยไปมากโดยไม่คุยกัน<br />
          วางที่ไหนก็ได้ · เว้นช่องไว้ได้ · ดึงกลับได้
        </p>
      </div>
      <div className="w-full max-w-md space-y-4">
        <button onClick={onCreate} disabled={loading}
          className="w-full py-5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-900 font-semibold text-lg tracking-wide shadow-lg shadow-amber-900/40 transition-all hover:shadow-xl hover:shadow-amber-700/50 hover:-translate-y-0.5 disabled:opacity-50 animate-glow">
          {loading ? <Loader2 className="inline animate-spin w-5 h-5" /> : 'สร้างห้องใหม่'}
        </button>
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-amber-200/20" />
          <span className="text-amber-200/40 text-xs tracking-widest">หรือ</span>
          <div className="flex-1 h-px bg-amber-200/20" />
        </div>
        <div className="flex gap-3">
          <input type="text" placeholder="รหัสห้อง" value={inputCode} maxLength={4}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            className="flex-1 px-5 py-4 rounded-lg bg-slate-900/60 border border-amber-200/20 text-center text-2xl tracking-[0.4em] font-display text-amber-100 placeholder:text-amber-200/20 focus:outline-none focus:border-amber-400/60 focus:bg-slate-900/80 transition-all" />
          <button onClick={onJoin} disabled={loading || inputCode.length !== 4}
            className="px-6 rounded-lg bg-indigo-800/60 hover:bg-indigo-700/60 border border-amber-200/30 text-amber-100 transition-all disabled:opacity-30">
            เข้าห้อง
          </button>
        </div>
        {error && <div className="text-rose-300 text-center text-sm bg-rose-900/20 border border-rose-500/30 rounded-lg py-3 animate-fadeIn">{error}</div>}
      </div>
      <div className="mt-16 max-w-lg text-center text-amber-100/40 text-xs leading-relaxed space-y-1">
        <p>ด่าน 1 จั่ว 3 ใบ · ด่าน 2 จั่ว 4 ใบ · ไต่ระดับถึงด่าน 10</p>
        <p>❤ หัวใจ 3 ดวง · 👁 ตัวช่วย: เปิดหงายไพ่ในสนาม 2 ใบ</p>
      </div>
    </div>
  );
}

function WaitingScreen({ roomCode, onCopy, copied, onCancel }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 animate-fadeIn">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-amber-300 animate-spin mx-auto mb-6" />
        <p className="text-amber-100/60 mb-8 tracking-wider">กำลังรอเพื่อน...</p>
        <div className="mb-3 text-xs text-amber-200/50 tracking-[0.3em] uppercase">รหัสห้อง</div>
        <div onClick={onCopy}
          className="cursor-pointer group inline-flex items-center gap-4 px-10 py-6 rounded-xl bg-slate-900/60 border-2 border-amber-400/40 hover:border-amber-400 transition-all hover:scale-105 animate-glow">
          <span className="font-display text-6xl md:text-7xl tracking-[0.2em] text-amber-100 font-semibold">{roomCode}</span>
          <Copy className="w-5 h-5 text-amber-300/60 group-hover:text-amber-300 transition-colors" />
        </div>
        {copied && <div className="mt-3 text-amber-300 text-sm animate-fadeIn">คัดลอกแล้ว ✓</div>}
        <p className="mt-8 text-amber-100/50 text-sm max-w-sm mx-auto">ส่งรหัสนี้ให้เพื่อน เพื่อเข้ามาเล่นด้วยกัน</p>
        <button onClick={onCancel} className="mt-12 text-amber-200/40 hover:text-amber-200 text-sm flex items-center gap-2 mx-auto">
          <X className="w-4 h-4" /> ยกเลิก
        </button>
      </div>
    </div>
  );
}

function StatusBar({ state }) {
  return (
    <div className="flex justify-between items-center gap-4 px-2">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-amber-200/20">
        <span className="text-xs tracking-widest text-amber-200/60">ด่าน</span>
        <span className="font-display text-2xl text-amber-100 font-semibold">{state.level}</span>
        <span className="text-xs text-amber-200/40">/{MAX_LEVEL}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: Math.max(state.hearts, STARTING_HEARTS) }).map((_, i) => (
            <Heart key={i}
              className={`w-5 h-5 md:w-6 md:h-6 transition-all ${i < state.hearts ? 'fill-rose-400 text-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.5)]' : 'text-slate-700'}`} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: Math.max(state.helpers, 1) }).map((_, i) => (
            <Eye key={i}
              className={`w-5 h-5 md:w-6 md:h-6 transition-all ${i < state.helpers ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(103,232,249,0.5)]' : 'text-slate-700'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GameScreen({
  state, playerId,
  drag, startDrag,
  peekMode, onPeekStart, onPeekTap, onPeekCancel,
  onRevealNow,
  lastBonus, onClearBonus,
  seqScrollRef,
}) {
  const myHand = playerId === 'p1' ? state.p1Hand : state.p2Hand;
  const oppHand = playerId === 'p1' ? state.p2Hand : state.p1Hand;
  const oppDrag = playerId === 'p1' ? state.p2Dragging : state.p1Dragging;
  const filledCount = state.sequence.filter(c => c != null).length;
  const totalSlots = state.sequence.length;
  const allFilled = filledCount === totalSlots;
  const faceDownCount = state.sequence.filter(c => c && !state.revealedValues.includes(c.value)).length;

  const scrollSeq = (dir) => {
    if (!seqScrollRef.current) return;
    seqScrollRef.current.scrollBy({ left: dir * 180, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col px-2 py-3 md:px-4 md:py-4">
      <StatusBar state={state} />

      {lastBonus && (
        <div className="mx-auto mt-3 px-5 py-3 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-100 text-sm flex items-center gap-3 animate-fadeIn">
          <Sparkles className="w-4 h-4 text-amber-300" />
          โบนัสด่านใหม่:
          {lastBonus.hearts ? <span className="flex items-center gap-1"><Heart className="w-4 h-4 fill-rose-400 text-rose-400" />+{lastBonus.hearts}</span> : null}
          {lastBonus.helpers ? <span className="flex items-center gap-1"><Eye className="w-4 h-4 text-cyan-300" />+{lastBonus.helpers}</span> : null}
          <button onClick={onClearBonus} className="ml-2 text-amber-200/60"><X className="w-4 h-4" /></button>
        </div>
      )}

      {peekMode.active && (
        <div className="mx-auto mt-3 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-cyan-100 text-sm flex items-center gap-3 animate-fadeIn">
          <Eye className="w-4 h-4 text-cyan-300 animate-pulse" />
          แตะการ์ดในสนามเพื่อเปิด (เหลือ {peekMode.picksLeft} ใบ)
          <button onClick={onPeekCancel} className="ml-2 text-cyan-200/70 hover:text-cyan-100 flex items-center gap-1 text-xs">
            <X className="w-3 h-3" /> หยุด
          </button>
        </div>
      )}

      <div className="mt-4 md:mt-6">
        <div className="text-center text-xs tracking-[0.3em] uppercase text-amber-200/50 mb-2">
          เพื่อน · เหลือ {oppHand.length} ใบ
          {oppDrag && <span className="ml-2 text-cyan-300 animate-pulse">• กำลังลากไพ่</span>}
        </div>
        <div className="flex justify-center gap-1 flex-wrap">
          {oppHand.map((_, i) => (
            <div key={i} className="card-back w-8 h-12 md:w-10 md:h-14 rounded" />
          ))}
          {oppHand.length === 0 && <div className="text-amber-200/30 text-sm italic py-2">วางครบแล้ว</div>}
        </div>
      </div>

      <div className="flex-1 my-4 flex flex-col justify-center min-h-0">
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="text-xs tracking-[0.3em] uppercase text-amber-200/50">
            กองไพ่ · {filledCount}/{totalSlots} ช่อง
          </div>
          <div className="flex gap-1">
            <button onClick={() => scrollSeq(-1)} className="p-1.5 rounded bg-slate-900/50 hover:bg-slate-800/60 border border-amber-200/20 text-amber-200/60">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scrollSeq(1)} className="p-1.5 rounded bg-slate-900/50 hover:bg-slate-800/60 border border-amber-200/20 text-amber-200/60">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <SequenceArea
          state={state} playerId={playerId}
          drag={drag} oppDrag={oppDrag}
          startDrag={startDrag} seqScrollRef={seqScrollRef}
          peekMode={peekMode} onPeekTap={onPeekTap}
        />
      </div>

      <div className="flex justify-center gap-3 mb-3 flex-wrap">
        <button
          onClick={onPeekStart}
          disabled={state.helpers <= 0 || faceDownCount === 0 || peekMode.active}
          className="px-5 py-2.5 rounded-full bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-400/40 text-cyan-100 text-sm flex items-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
        >
          <Eye className="w-4 h-4" /> ใช้ตัวช่วย · เปิดในสนาม 2 ใบ (เหลือ {state.helpers})
        </button>
        {myHand.length === 0 && !drag && !peekMode.active && (
          <button onClick={onRevealNow}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-900 font-semibold text-sm flex items-center gap-2 animate-glow">
            <Sparkles className="w-4 h-4" /> ยืนยัน
          </button>
        )}
      </div>

      <div data-hand="mine"
        className={`pb-2 rounded-xl transition-all ${drag && drag.source === 'seq' ? 'bg-amber-400/5 ring-2 ring-amber-400/30' : ''}`}
      >
        <div className="text-center text-xs tracking-[0.3em] uppercase text-amber-200/50 mb-2">
          มือของคุณ · เหลือ {myHand.length} ใบ
          {drag && drag.source === 'seq' && <span className="ml-2 text-amber-300 animate-pulse">• ปล่อยตรงนี้เพื่อเอากลับ</span>}
        </div>
        <div className="flex justify-center gap-2 md:gap-3 flex-wrap min-h-[6rem] items-center">
          {myHand.map((v) => {
            const isDragging = drag && drag.source === 'hand' && drag.value === v;
            return <CardInHand key={v} value={v} onDragStart={startDrag} hidden={isDragging} />;
          })}
          {myHand.length === 0 && (
            <div className="text-amber-200/40 italic py-6">วางครบแล้ว{!allFilled && ' · รอเพื่อน หรือสลับการ์ดได้'}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardInHand({ value, onDragStart, hidden }) {
  const elRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { elRef.current?.setPointerCapture?.(e.pointerId); } catch {}
    onDragStart({ value, source: 'hand' }, e.clientX, e.clientY);
  };
  return (
    <button
      ref={elRef}
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none', opacity: hidden ? 0.3 : 1 }}
      className="card-face own-glow w-16 h-24 md:w-20 md:h-28 rounded-lg font-display text-3xl md:text-4xl font-semibold hover:-translate-y-2 hover:scale-105 transition-transform cursor-grab active:cursor-grabbing active:scale-95 select-none"
    >
      {value}
    </button>
  );
}

function SequenceArea({ state, playerId, drag, oppDrag, startDrag, seqScrollRef, peekMode, onPeekTap }) {
  const seq = state.sequence;
  const myHover = drag && drag.hoverType === 'seq' ? drag.hoverIndex : null;
  const oppHover = oppDrag && oppDrag.hoverType === 'seq' ? oppDrag.hoverIndex : null;
  const oppDraggedFromSlot = oppDrag?.source === 'seq' ? oppDrag.sourceIndex : null;
  const myDraggedFromSlot = drag?.source === 'seq' ? drag.sourceIndex : null;

  return (
    <div
      ref={seqScrollRef}
      data-seq-container
      className="overflow-x-auto overflow-y-hidden px-4 py-4"
      style={{ scrollbarWidth: 'thin' }}
    >
      <div className="flex items-start gap-1.5 md:gap-2 min-w-min w-max mx-auto py-2">
        {seq.map((cell, idx) => {
          const effectiveCell = myDraggedFromSlot === idx ? null : cell;
          const isMyHover = myHover === idx;
          const isOppHover = oppHover === idx;
          const isRevealed = effectiveCell && state.revealedValues.includes(effectiveCell.value);
          const isMine = effectiveCell && effectiveCell.by === playerId;
          const visibleToMe = effectiveCell && (isMine || isRevealed);
          const oppFade = oppDraggedFromSlot === idx;
          const isPeekable = peekMode.active && effectiveCell && !isRevealed;
          return (
            <Slot
              key={idx} idx={idx} cell={effectiveCell}
              isMyHover={isMyHover} isOppHover={isOppHover}
              isRevealed={isRevealed} isMine={isMine} visibleToMe={visibleToMe}
              oppFade={oppFade} isPeekable={isPeekable}
              onStartDrag={startDrag} onPeekTap={onPeekTap}
              dragValue={drag?.value}
            />
          );
        })}
      </div>
    </div>
  );
}

function Slot({ idx, cell, isMyHover, isOppHover, isRevealed, isMine, visibleToMe, oppFade, isPeekable, onStartDrag, onPeekTap, dragValue }) {
  const filled = cell != null;
  const canDrag = filled && isMine && !isPeekable;
  const elRef = useRef(null);

  const onPointerDown = (e) => {
    if (isPeekable) return;
    if (!canDrag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { elRef.current?.setPointerCapture?.(e.pointerId); } catch {}
    onStartDrag({ value: cell.value, source: 'seq', sourceIndex: idx }, e.clientX, e.clientY);
  };

  const onClick = (e) => {
    if (isPeekable) {
      e.preventDefault(); e.stopPropagation();
      onPeekTap(idx);
    }
  };

  let bgClass = '';
  if (!filled) bgClass = 'slot-empty';
  else if (visibleToMe) bgClass = 'card-face';
  else bgClass = 'card-back';

  return (
    <div
      ref={elRef}
      data-slot={idx}
      data-filled={filled ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{ touchAction: canDrag ? 'none' : 'auto' }}
      className="flex-shrink-0 flex flex-col items-center gap-1 select-none"
    >
      <div className={`text-[10px] transition-colors ${isMyHover ? 'text-amber-300 font-semibold' : 'text-amber-200/30'}`}>
        {idx + 1}
      </div>
      <div
        className={`relative w-14 h-20 md:w-16 md:h-24 rounded-lg transition-all
          ${bgClass}
          ${filled && isMine ? 'own-glow' : ''}
          ${isMyHover && !filled ? 'ring-4 ring-amber-400 scale-110' : ''}
          ${isMyHover && filled ? 'ring-2 ring-rose-400/60' : ''}
          ${isOppHover && !filled ? 'ring-2 ring-cyan-300 bg-cyan-400/10' : ''}
          ${oppFade ? 'opacity-30' : ''}
          ${isPeekable ? 'cursor-pointer ring-2 ring-cyan-400/60 animate-peek-pulse hover:scale-110' : ''}
          ${canDrag && !isPeekable ? 'cursor-grab active:cursor-grabbing hover:-translate-y-1' : ''}
        `}
      >
        {isMyHover && !filled && dragValue != null && (
          <div className="absolute inset-0 rounded-lg bg-amber-400/30 flex items-center justify-center font-display text-xl md:text-2xl font-semibold text-amber-100 animate-pulse">
            {dragValue}
          </div>
        )}
        {filled && visibleToMe && (
          <div className="w-full h-full flex items-center justify-center font-display text-xl md:text-2xl font-semibold relative">
            {cell.value}
            {isRevealed && (
              <div className="absolute bottom-0.5 right-1 text-cyan-700">
                <Eye className="w-2.5 h-2.5" />
              </div>
            )}
          </div>
        )}
        {filled && isMine && !visibleToMe && (
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
        )}
        {!filled && isOppHover && !isMyHover && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Hand className="w-4 h-4 text-cyan-300/70" />
          </div>
        )}
      </div>
    </div>
  );
}

function RevealScreen({ state, revealIdx, onContinue, playerId }) {
  const placed = state.sequence;
  const values = placed.map(p => p.value);
  const sorted = [...values].sort((a, b) => a - b);
  const done = revealIdx >= placed.length;
  const success = state.result === 'success';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 animate-fadeIn">
      <StatusBar state={state} />
      <h2 className="font-display text-4xl md:text-5xl mt-8 mb-2 shimmer-text text-center">เปิดไพ่!</h2>
      <p className="text-amber-200/60 text-sm mb-8 tracking-wider">ตามลำดับช่องในสนาม</p>
      <div className="flex flex-wrap justify-center gap-2 md:gap-3 max-w-5xl mb-8">
        {placed.map((card, i) => {
          const revealed = i < revealIdx;
          const current = i === revealIdx - 1;
          const correct = revealed && card.value === sorted[i];
          const isMine = card.by === playerId;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="text-xs text-amber-200/30">{i + 1}</div>
              <div className={`w-14 h-20 md:w-16 md:h-24 rounded-lg transition-all ${revealed ? 'card-face animate-flip' : 'card-back'} ${current ? 'scale-110 ring-4 ring-amber-400/60' : ''} ${isMine && !revealed ? 'own-glow' : ''}`}>
                {revealed && (
                  <div className="w-full h-full flex items-center justify-center font-display text-xl md:text-2xl font-semibold relative">
                    {card.value}
                    <div className="absolute bottom-0.5 right-1 text-[8px] text-slate-500 font-body">
                      {isMine ? 'คุณ' : 'เพื่อน'}
                    </div>
                  </div>
                )}
              </div>
              {revealed && !correct && <div className="text-rose-400 text-xs">✗</div>}
              {revealed && correct && <div className="text-emerald-400 text-xs">✓</div>}
            </div>
          );
        })}
      </div>
      {done && (
        <div className="text-center animate-fadeIn">
          {success ? (
            <>
              <div className="text-6xl mb-4">✨</div>
              <h3 className="font-display text-4xl md:text-5xl text-emerald-300 mb-3">สำเร็จ!</h3>
              <p className="text-amber-100/70 mb-6">เรียงถูกลำดับทั้งหมด</p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4">💔</div>
              <h3 className="font-display text-4xl md:text-5xl text-rose-300 mb-3">พลาด</h3>
              <p className="text-amber-100/70 mb-6">ลำดับไม่ถูกต้อง เสียหัวใจ 1 ดวง</p>
            </>
          )}
          <button onClick={onContinue}
            className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-900 font-semibold tracking-wider shadow-lg shadow-amber-900/40 hover:scale-105 transition-all inline-flex items-center gap-2">
            {success ? (state.level === MAX_LEVEL ? 'จบเกม' : 'ไปด่านต่อไป') : 'ลองใหม่'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function EndScreen({ state, onRestart }) {
  const victory = state.gameResult === 'victory';
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 animate-fadeIn">
      <div className="text-center max-w-lg">
        {victory ? (
          <>
            <Trophy className="w-20 h-20 text-amber-300 mx-auto mb-6 drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]" />
            <h1 className="font-display text-5xl md:text-6xl shimmer-text mb-4">ชัยชนะ</h1>
            <p className="text-amber-100/70 text-lg mb-2">ผ่านทั้ง 10 ด่าน!</p>
          </>
        ) : (
          <>
            <Skull className="w-20 h-20 text-rose-300/80 mx-auto mb-6" />
            <h1 className="font-display text-5xl md:text-6xl text-rose-200 mb-4">จบเกม</h1>
            <p className="text-amber-100/70 text-lg mb-2">หมดหัวใจที่ด่าน {state.level}</p>
          </>
        )}
        <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm mx-auto">
          <Stat label="ด่าน" value={state.level} />
          <Stat label="หัวใจ" value={state.hearts} />
          <Stat label="ตัวช่วย" value={state.helpers} />
        </div>
        <button onClick={onRestart}
          className="mt-10 px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-900 font-semibold tracking-wider shadow-lg shadow-amber-900/40 hover:scale-105 transition-all inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> เล่นอีกครั้ง
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="px-3 py-4 rounded-lg bg-slate-900/50 border border-amber-200/20">
      <div className="text-xs tracking-widest text-amber-200/50 uppercase mb-1">{label}</div>
      <div className="font-display text-3xl text-amber-100">{value}</div>
    </div>
  );
}

// ==================== STYLES ====================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&display=swap');
  .font-display { font-family: 'Cormorant Garamond', 'Prompt', serif; }
  .font-body { font-family: 'Prompt', sans-serif; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(212,175,55,0.3); } 50% { box-shadow: 0 0 40px rgba(212,175,55,0.6); } }
  @keyframes cardFlip { from { transform: rotateY(180deg); } to { transform: rotateY(0deg); } }
  @keyframes float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-6px);} }
  @keyframes shimmer { 0%{background-position:-200% 0;} 100%{background-position:200% 0;} }
  @keyframes peek-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(103,232,249,0.4), 0 0 16px rgba(103,232,249,0.2); }
    50% { box-shadow: 0 0 16px rgba(103,232,249,0.7), 0 0 32px rgba(103,232,249,0.4); }
  }
  .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
  .animate-glow { animation: pulse-glow 2.5s ease-in-out infinite; }
  .animate-float { animation: float 3s ease-in-out infinite; }
  .animate-flip { animation: cardFlip 0.6s ease-out; transform-style: preserve-3d; }
  .animate-peek-pulse { animation: peek-pulse 1.4s ease-in-out infinite; }
  .bg-midnight {
    background:
      radial-gradient(ellipse at 20% 10%, rgba(99,52,138,0.25) 0%, transparent 45%),
      radial-gradient(ellipse at 80% 90%, rgba(42,76,139,0.3) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(15,15,35,1) 0%, #0a0a1f 100%);
  }
  .starfield {
    background-image:
      radial-gradient(1px 1px at 20px 30px, white, transparent),
      radial-gradient(1px 1px at 80px 120px, white, transparent),
      radial-gradient(1px 1px at 150px 80px, white, transparent),
      radial-gradient(2px 2px at 200px 200px, white, transparent),
      radial-gradient(1px 1px at 300px 50px, white, transparent),
      radial-gradient(1px 1px at 250px 300px, white, transparent);
    background-size: 350px 350px;
  }
  .card-face {
    background: linear-gradient(145deg, #faf5e8 0%, #e8dec5 100%);
    color: #1a1033;
    border: 2px solid #d4af37;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.5);
  }
  .card-back {
    background:
      repeating-linear-gradient(45deg, #2a1654 0 8px, #1f0f44 8px 16px),
      linear-gradient(135deg, #2a1654, #1a0a3d);
    border: 2px solid #d4af37;
    position: relative;
    overflow: hidden;
  }
  .card-back::before {
    content: ''; position: absolute; inset: 10%;
    border: 1px solid rgba(212,175,55,0.4); border-radius: 4px;
  }
  .card-back::after {
    content: '✦'; position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    color: rgba(212,175,55,0.6); font-size: 1.1em;
  }
  .slot-empty {
    background:
      repeating-linear-gradient(135deg, rgba(212,175,55,0.05) 0 6px, transparent 6px 12px),
      rgba(15,15,35,0.4);
    border: 2px dashed rgba(212,175,55,0.3);
  }
  .own-glow {
    box-shadow: 0 0 12px rgba(251,191,36,0.55), 0 0 24px rgba(251,191,36,0.25), inset 0 0 10px rgba(251,191,36,0.08);
    border-color: rgba(251,191,36,0.85);
  }
  .shimmer-text {
    background: linear-gradient(90deg, #d4af37 0%, #faf5e8 25%, #d4af37 50%, #faf5e8 75%, #d4af37 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 3s linear infinite;
  }
  input, button { font-family: 'Prompt', sans-serif; }
  ::-webkit-scrollbar { height: 6px; width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.3); border-radius: 3px; }
`;
