import type { MemeticEngine } from './MemeticEngine';
import { TRAITS } from '../data/loadDataset';
import { dot } from '../math/vector';

export function captureEndState(engine: MemeticEngine, selectedId: string) {
  const selected = engine.getMeme(selectedId);
  if (!selected || !engine.data) throw new Error('Select a meme from the current run first.');
  // Vectors are immutable per variant. Follow the selected variant's descendants.
  const descendants = new Set([selected.id]);
  const family = engine.lineage(selected.id);
  let end = selected;
  for (const { meme } of family) {
    if (meme.parentId && descendants.has(meme.parentId)) descendants.add(meme.id);
    if (descendants.has(meme.id) && (meme.generation > end.generation || (meme.generation === end.generation && meme.originTick > end.originTick))) end = meme;
  }
  const root = engine.getMeme(end.rootId)!;
  return {
    schemaVersion: 1, capturedAt: new Date().toISOString(), tick: engine.tick, seed: engine.config.seed,
    config: { ...engine.config }, selectedId, memeId: end.id, rootId: end.rootId, parentId: end.parentId,
    generation: end.generation, vector: Array.from(end.vector), rootVector: Array.from(root.vector),
    rootText: root.text, driftDistance: end.driftDistance,
    traits: Object.fromEntries(TRAITS.map(t => [t, dot(end.vector, engine.data!.anchors[t])])),
    nearestTweets: engine.roots.map(m => ({ id: m.id, text: m.text, similarity: dot(end.vector, m.vector) }))
      .sort((a, b) => b.similarity - a.similarity).slice(0, 5),
  };
}
export type EndState = ReturnType<typeof captureEndState>;
