import ControlPanel from './components/ControlPanel';
import MetricsBar from './components/MetricsBar';
import AgentInspector from './components/AgentInspector';
import MemePanel from './components/MemePanel';
import SemanticCanvas from './components/canvas/SemanticCanvas';
import TrustGraphCanvas from './components/canvas/TrustGraphCanvas';
import { useSimStore } from './store/useSimStore';
import { rampCss } from './components/palette';

export default function App() {
  const mode = useSimStore((s) => s.mode);
  const tick = useSimStore((s) => s.metrics.tick);
  const agentCount = useSimStore((s) => s.config.agentCount);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-void text-mist">
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hair px-6 py-3">
        <div className="flex items-baseline gap-4">
          <h1 className="text-lg tracking-tight text-mist">Drift</h1>
          <p className="text-xs text-slate">
            A population of {agentCount} agents trading ideas, and what that does to how carefully
            they think.
          </p>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-slate">
          <Legend />
          <span>tick {tick}</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-hair lg:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="min-h-0 overflow-hidden bg-panel">
          <ControlPanel />
        </aside>

        <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(180px,0.7fr)] gap-px bg-hair">
          <div className="bg-hair">
            <MetricsBar />
          </div>
          <div className="relative min-h-[320px] bg-panel">
            {mode === 'semantic' ? <SemanticCanvas /> : <TrustGraphCanvas />}
            <p className="pointer-events-none absolute left-4 top-3 max-w-xs text-xs leading-snug text-slate">
              {mode === 'semantic'
                ? 'Each point is an agent, placed by what it believes and coloured by how much proof it demands.'
                : 'Edges brighten as trust grows. Every flash is one idea being passed to a neighbour.'}
            </p>
          </div>
          <div className="min-h-0 bg-hair">
            <MemePanel />
          </div>
        </main>

        <aside className="min-h-0 overflow-hidden bg-panel">
          <AgentInspector />
        </aside>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-2">
      <span>rational</span>
      <span
        className="h-1.5 w-24 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${rampCss(0)}, ${rampCss(0.55)}, ${rampCss(1)})`,
        }}
      />
      <span>irrational</span>
    </span>
  );
}
