import { loadDataset } from '../core/data/loadDataset';
import { create } from 'zustand';
import { MemeticEngine, type Metrics } from '../core/engine/MemeticEngine';
import { applyPreset, DEFAULT_CONFIG, PRESETS, type SimConfig } from '../core/engine/config';

export type CanvasMode = 'cosmos' | 'semantic' | 'trust';

interface SimState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  initialize: () => Promise<void>;
  engine: MemeticEngine;
  config: SimConfig;
  presetId: string;
  running: boolean;
  stopAtTick: number | null;
  runForTicks: (ticks: number) => void;
  advanceTick: () => void;
  ticksPerFrame: number;
  mode: CanvasMode;
  selectedAgent: number | null;
  selectedMeme: string | null;
  metrics: Metrics;
  showTrails: boolean;
  /** Bumped whenever the engine has advanced, so panels can re-read it. */
  revision: number;

  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepOnce: () => void;
  setSpeed: (n: number) => void;
  setMode: (m: CanvasMode) => void;
  selectAgent: (i: number | null) => void;
  selectMeme: (id: string | null) => void;
  setConfig: (patch: Partial<SimConfig>) => void;
  loadPreset: (id: string) => void;
  restart: () => void;
  reseed: () => void;
  injectMeme: (irrationality: number) => void;
  toggleTrails: () => void;
  publishFrame: () => void;
}

const engine = new MemeticEngine(DEFAULT_CONFIG);

export const useSimStore = create<SimState>((set, get) => ({
  engine,
  status: 'idle',
  error: null,
  initialize: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null, running: false });
    try {
      const data = await loadDataset();
      get().engine.initialize(data);
      get().engine.step();
      set({ status: 'ready', running: true });
      get().publishFrame();
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error), running: false });
    }
  },
  config: { ...DEFAULT_CONFIG },
  presetId: 'baseline',
  running: false,
  stopAtTick: null,
  runForTicks: (ticks) => {
    if (get().status !== 'ready' || !Number.isInteger(ticks) || ticks < 1 || ticks > 10000) return;
    set({ stopAtTick: get().engine.tick + ticks, running: true });
  },
  advanceTick: () => {
    const state = get();
    state.engine.step();
    if (state.stopAtTick !== null && state.engine.tick >= state.stopAtTick) {
      set({ running: false, stopAtTick: null });
      get().publishFrame();
    }
  },
  ticksPerFrame: 1,
  mode: 'cosmos',
  selectedAgent: null,
  selectedMeme: null,
  metrics: engine.metrics(),
  showTrails: true,
  revision: 0,

  play: () => set({ running: get().status === 'ready' }),
  pause: () => { set({ running: false }); get().publishFrame(); },
  toggle: () => {
    if (get().running) get().pause(); else get().play();
  },
  stepOnce: () => {
    if (get().status !== 'ready') return;
    set({ running: false });
    get().advanceTick();
    get().publishFrame();
  },
  setSpeed: (n) => set({ ticksPerFrame: n }),
  setMode: (mode) => set({ mode }),
  selectAgent: (selectedAgent) => set({ selectedAgent }),
  selectMeme: (selectedMeme) => set({ selectedMeme }),
  toggleTrails: () => set((s) => ({ showTrails: !s.showTrails })),

  setConfig: (patch) => {
    const config = { ...get().config, ...patch };
    const engineRef = get().engine;
    // Structural parameters need a rebuild; behavioural ones apply live.
    const structural =
      patch.agentCount !== undefined ||
      patch.meanDegree !== undefined ||
      patch.rewireProbability !== undefined ||
      patch.seed !== undefined;
    if (structural) {
      engineRef.reset(config);
    } else {
      engineRef.config = config;
    }
    set({ stopAtTick: null, config, presetId: 'custom', ...(structural ? { selectedAgent: null, selectedMeme: null } : {}) });
    get().publishFrame();
  },

  loadPreset: (id) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const config = applyPreset({ ...DEFAULT_CONFIG, seed: get().config.seed }, preset);
    get().engine.reset(config);
    set({ stopAtTick: null, config, presetId: id, selectedAgent: null, selectedMeme: null });
    get().publishFrame();
  },

  restart: () => {
    get().engine.reset(get().config);
    set({ stopAtTick: null, selectedAgent: null, selectedMeme: null });
    get().publishFrame();
  },

  reseed: () => {
    const config = { ...get().config, seed: Math.floor(Math.random() * 2 ** 31) };
    get().engine.reset(config);
    set({ stopAtTick: null, config, selectedAgent: null, selectedMeme: null });
    get().publishFrame();
  },

  injectMeme: (irrationality) => {
    if (get().status !== 'ready') return;
    const meme = get().engine.injectMeme(irrationality, 5);
    set({ selectedMeme: meme.id });
    get().publishFrame();
  },

  publishFrame: () =>
    set((s) => ({ metrics: s.engine.metrics(), revision: s.revision + 1 })),
}));

/** Panels that only need periodic refresh subscribe to this. */
export const selectRevision = (s: SimState) => s.revision;
