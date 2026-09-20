import { D, dot, normalize, norm } from '../math/vector';

export const TRAITS = ['rigor', 'outrage', 'absurdity', 'simplicity'] as const;
export type Trait = typeof TRAITS[number];
export type TraitAnchors = Record<Trait, Float64Array>;
export const ANCHOR_PHRASES: Record<Trait, string> = {
  rigor: 'Nuanced statistical evidence, uncertainty intervals, epistemic caveats, preregistered hypotheses, and independent replication.',
  outrage: 'Moral condemnation, righteous anger, affective polarization, and existential alarm about a threatening out-group.',
  absurdity: 'Unfalsifiable conspiracies, secret omnipotent forces, surreal explanations, and extravagant hyperbole.',
  simplicity: 'A simple binary slogan: us versus them, one obvious answer, no caveats, no nuance.',
};
export interface TweetRecord {
  id: number; text: string; rationality: number; virality: number;
  cognitiveLoad: number; mutationVariance: number;
}
export interface Dataset { tweets: TweetRecord[]; vectors: Float64Array[]; anchors: TraitAnchors }

/** NPY v1–v3, float16/32/64, either byte order and C/Fortran layout. */
export function parseNpy(buffer: ArrayBuffer, rows = 200): Float64Array[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 10 || new Uint8Array(buffer, 0, 6).join(',') !== '147,78,85,77,80,89') throw new Error('Invalid NPY signature');
  const version = view.getUint8(6);
  if (![1, 2, 3].includes(version)) throw new Error('Unsupported NPY version');
  const start = version === 1 ? 10 : 12;
  if (buffer.byteLength < start) throw new Error('Truncated NPY header');
  const size = version === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const offset = start + size;
  if (offset > buffer.byteLength) throw new Error('Truncated NPY header');
  const header = new TextDecoder().decode(new Uint8Array(buffer, start, size));
  const dtype = /['"]descr['"]\s*:\s*['"]([<>=|])f(2|4|8)['"]/.exec(header);
  const shape = /['"]shape['"]\s*:\s*\(\s*(\d+)\s*,\s*(\d+)\s*,?\s*\)/.exec(header);
  const order = /['"]fortran_order['"]\s*:\s*(True|False)/.exec(header);
  if (!dtype || !shape || !order || +shape[1] !== rows || +shape[2] !== D) throw new Error(`Expected floating NPY shape (${rows}, ${D})`);
  const bytes = +dtype[2];
  const little = dtype[1] !== '>';
  if (offset + rows * D * bytes !== buffer.byteLength) throw new Error('NPY payload length mismatch');
  return Array.from({ length: rows }, (_, row) => {
    const vector = new Float64Array(D);
    for (let col = 0; col < D; col++) {
      const index = order[1] === 'True' ? col * rows + row : row * D + col;
      const pos = offset + index * bytes;
      if (bytes === 2) {
        const h = view.getUint16(pos, little), sign = h & 32768 ? -1 : 1;
        const exp = (h >> 10) & 31, mantissa = h & 1023;
        vector[col] = sign * (exp === 0 ? mantissa * 2 ** -24 : exp === 31 ? (mantissa ? NaN : Infinity) : (1 + mantissa / 1024) * 2 ** (exp - 15));
      } else vector[col] = bytes === 4 ? view.getFloat32(pos, little) : view.getFloat64(pos, little);
    }
    if (!vector.every(Number.isFinite) || norm(vector) < 1e-12) throw new Error(`Invalid embedding row ${row}`);
    return normalize(vector); // Correct float16 quantization of unit vectors.
  });
}
export function parseAnchors(value: unknown): TraitAnchors {
  if (!value || typeof value !== 'object') throw new Error('Invalid trait anchors');
  const raw = TRAITS.map(key => {
    const v = (value as Record<string, unknown>)[key];
    if (!Array.isArray(v) || v.length !== D || !v.every(x => typeof x === 'number' && Number.isFinite(x))) throw new Error(`Anchor ${key} must contain 256 finite numbers`);
    const vector = new Float64Array(v);
    if (norm(vector) < 1e-12) throw new Error(`Anchor ${key} is zero`);
    return normalize(vector);
  });

  // Sentence embeddings carry a large shared “language” direction. Without
  // calibration, the four trait cosines become nearly identical (for example
  // +0.94 on every axis) and the UI appears to say that every worldview has
  // every trait. Remove the common component and Gram–Schmidt the remaining
  // directions so each displayed coordinate measures a distinct trait pole.
  const common = new Float64Array(D);
  for (const vector of raw) for (let d = 0; d < D; d++) common[d] += vector[d];
  normalize(common);
  const axes: Float64Array[] = [];
  for (let i = 0; i < raw.length; i++) {
    const axis = new Float64Array(D);
    // Remove most of the shared direction while retaining a small component;
    // fully projecting it out would make four centered anchors rank-three.
    const shared = 0.85 * dot(raw[i], common);
    for (let d = 0; d < D; d++) axis[d] = raw[i][d] - shared * common[d];
    for (const previous of axes) {
      const projection = dot(axis, previous);
      for (let d = 0; d < D; d++) axis[d] -= projection * previous[d];
    }
    if (norm(axis) < 1e-6) throw new Error(`Trait anchor ${TRAITS[i]} is not independent after calibration`);
    axes.push(normalize(axis));
  }
  return Object.fromEntries(TRAITS.map((key, i) => [key, axes[i]])) as TraitAnchors;
}
export async function loadDataset(): Promise<Dataset> {
  const fetchFile = async (name: string) => {
    const response = await fetch(`${(import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL}${name}`);
    if (!response.ok) throw new Error(`Cannot load ${name} (${response.status}). See README.md for anchor setup.`);
    return response;
  };
  const [metadata, embeddings, anchors] = await Promise.all(['memetic_tweets.json', 'tweet_embeddings.npy', 'trait_anchors.json'].map(fetchFile));
  const tweets: TweetRecord[] = await metadata.json();
  if (!Array.isArray(tweets) || tweets.length !== 200 || new Set(tweets.map(t => t.id)).size !== 200) throw new Error('Expected 200 unique tweet records');
  for (const t of tweets) {
    if (!Number.isInteger(t.id) || typeof t.text !== 'string' || !t.text.trim() || !['rationality', 'virality', 'cognitiveLoad', 'mutationVariance'].every(k => {
      const v = t[k as keyof TweetRecord]; return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
    })) throw new Error('Invalid tweet metadata');
  }
  let parsedAnchors: TraitAnchors;
  try { parsedAnchors = parseAnchors(await anchors.json()); }
  catch { throw new Error('Missing or invalid public/trait_anchors.json. Encode the four exact phrases shown below using the tweet embedding model.'); }
  return { tweets, vectors: parseNpy(await embeddings.arrayBuffer()), anchors: parsedAnchors };
}
