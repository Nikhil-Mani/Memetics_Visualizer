import EndStatePanel from './components/EndStatePanel';
import ResizablePanel, { resetPanelLayout } from './components/layout/ResizablePanel';
import { useEffect } from 'react';
import MemeCosmos from './components/canvas/MemeCosmos';
import DriftAnalytics from './components/DriftAnalytics';
import { ANCHOR_PHRASES, TRAITS } from './core/data/loadDataset';
import ControlPanel from './components/ControlPanel';
import MetricsBar from './components/MetricsBar';
import AgentInspector from './components/AgentInspector';
import MemePanel from './components/MemePanel';
import SemanticCanvas from './components/canvas/SemanticCanvas';
import TrustGraphCanvas from './components/canvas/TrustGraphCanvas';
import { useSimStore } from './store/useSimStore';
import { rampCss } from './components/palette';

export default function App() {
  const status = useSimStore(s => s.status);
  const error = useSimStore(s => s.error);
  useEffect(() => { void useSimStore.getState().initialize(); }, []);
  const mode = useSimStore((s) => s.mode);
  const tick = useSimStore((s) => s.metrics.tick);
  const running = useSimStore(s => s.running);
  const agentCount = useSimStore((s) => s.config.agentCount);

  if (status !== 'ready') return <div className="min-h-screen bg-void p-8 text-mist">
    <h1 className="text-xl">Drift · 256D Meme Cosmos</h1>
    <p role="status" className="mt-4">{status === 'error' ? error : 'Loading tweets, embeddings, and trait anchors…'}</p>
    {status === 'error' && <div className="mt-5 max-w-3xl text-sm leading-relaxed">
      <p>Generate public/trait_anchors.json using the same Qwen3-Embedding-TurboX model2vec model and preprocessing as the tweets. See README.md and scripts/generate_trait_anchors.py. Encode these exact sentences:</p>
      <ul className="my-4 list-disc pl-5">{TRAITS.map(t => <li key={t}><strong>{t}:</strong> {ANCHOR_PHRASES[t]}</li>)}</ul>
      <p>Each key must contain 256 finite numbers. The simulation starts automatically once all three files load successfully.</p>
      <button className="chip mt-4" onClick={() => void useSimStore.getState().initialize()}>Retry loading</button>
    </div>}
  </div>;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a href="#workspace" className="wordmark" aria-label="Drift workspace">D<span>.</span></a>
        <nav aria-label="Workspace navigation"><a href="#workspace">01 : Observatory</a><a href="#activity">02 : Lineages</a><a href="#parameters">03 : Parameters</a></nav>
        <button className="chip" onClick={resetPanelLayout}>Reset layout ↗</button>
      </header>
      <div className="intro">
        <div><p className="eyebrow">COMPUTATIONAL MEMETICS / A LIVE EXPERIMENT</p><h1>Ideas move.<br /><span>Beliefs follow.</span></h1></div>
        <div className="intro-aside"><p>Observe how ideas evolve through a population.<br />Shape the conditions. Follow the drift.</p>
          <div className="run-status"><span className={running ? 'status-dot' : 'status-dot paused'} />{running ? 'LIVE' : 'PAUSED'} <span>/ {agentCount} AGENTS / TICK {tick}</span></div>
          <div className="flex gap-2"><button className="chip chip-on" onClick={() => useSimStore.getState().toggle()}>{running ? 'Pause run' : 'Resume run'}</button><button className="chip" onClick={() => useSimStore.getState().stepOnce()}>Step once ↗</button></div>
        </div>
      </div>
      <main id="workspace" className="workspace">
        <div className="workspace-label"><span>01 / THE OBSERVATORY</span><span>Drag any panel edge or corner to arrange your workspace.</span></div>
        <ResizablePanel id="metrics" title="Run telemetry" number="01.1" width="100%" height={290} minHeight={180}><MetricsBar /></ResizablePanel>
        <div id="parameters" className="panel-anchor" />
        <ResizablePanel id="controls" title="Parameters" number="01.2" width="calc(22% - 11px)" height={570}><ControlPanel /></ResizablePanel>
        <ResizablePanel id="cosmos" title="Semantic observatory" number="01.3" width="calc(50% - 11px)" height={570}>
          <div className="observatory-toolbar"><div className="flex flex-wrap gap-2">{(['cosmos', 'semantic', 'trust'] as const).map(view => <button key={view} className={mode === view ? 'chip chip-on' : 'chip'} onClick={() => useSimStore.getState().setMode(view)}>{view === 'cosmos' ? 'Meme Cosmos' : view === 'semantic' ? 'Agent space' : 'Trust network'}</button>)}</div><Legend agents={mode !== 'cosmos'} /></div>
          <div className="observatory-canvas">
            {mode === 'cosmos' ? <MemeCosmos /> : mode === 'semantic' ? <SemanticCanvas /> : <TrustGraphCanvas />}
            <p className="canvas-caption">{mode === 'cosmos' ? 'Originals, descendants & the space between. Select a point to trace its lineage.' : mode === 'semantic' ? 'Worldviews in motion. Select an agent to inspect.' : 'Blue edges: trust. Colored pulses: shared memes. Select an agent to inspect.'}</p>
          </div>
        </ResizablePanel>
        <ResizablePanel id="drift" title="Drift & lineage inspector" number="01.4" width="calc(28% - 10px)" height={570}><DriftAnalytics /></ResizablePanel>
        <div id="activity" className="workspace-label"><span>02 / THE RECORD</span><span>Every variant leaves a trace.</span></div>
        <ResizablePanel id="memes" title="Meme activity & ancestry" number="02.1" width="calc(70% - 8px)" height={760} minHeight={400}><MemePanel /></ResizablePanel>
        <ResizablePanel id="agents" title="Agent inspector" number="02.2" width="calc(30% - 8px)" height={760}><AgentInspector /></ResizablePanel>
        <ResizablePanel id="end-state" title="End-state embedding & meaning" number="03.1" width="100%" height={480}><EndStatePanel /></ResizablePanel>
      </main>
      <footer className="site-footer"><span>DRIFT / 256-DIMENSIONAL CULTURAL EVOLUTION</span><span>Observe. Question. Repeat.</span><a href="#workspace">Back to workspace ↑</a></footer>
    </div>
  );
}

function Legend({ agents = false }: { agents?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span>{agents ? 'high rigor' : 'rational'}</span>
      <span
        className="h-1.5 w-24 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${rampCss(0)}, ${rampCss(0.55)}, ${rampCss(1)})`,
        }}
      />
      <span>{agents ? 'low rigor' : 'irrational'}</span>
    </span>
  );
}
