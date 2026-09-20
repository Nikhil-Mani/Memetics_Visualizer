# Drift — 256D computational memetics

An existing React / Zustand / Canvas simulation upgraded to real tweet embeddings and trait-dependent Darwinian selection. Agent bounded confidence, retrospective peer trust, learning, and societal plasticity retain their original equations.

## Run and required data

```sh
npm install
npm run dev
npm run build
npm test
```

The original supplied files are copied into `public/memetic_tweets.json` and `public/tweet_embeddings.npy`. The loader requires 200 unique metadata records and a `(200, 256)` floating-point NPY array, joined by row index. It handles NumPy v1–v3, float16 (including the supplied dataset), float32, float64, both endiannesses, and C/Fortran storage, then normalizes into Float64Array vectors.

**All three data files are installed**, including the supplied `public/trait_anchors.json` with four normalized 256D anchors. The app displays actionable setup instructions if loading fails. After all three files validate, it ticks immediately and opens Meme Cosmos. No Play action is required. Retry loading after generating anchors; restart and presets reuse the validated dataset.

## Generate the four semantic anchors

The tweet embeddings were produced with **Qwen3-Embedding-TurboX via model2vec**, as supplied by the developer. Use the **exact same saved model, revision, tokenization, preprocessing, and any dimensionality reduction**. Matching dimension alone does not establish a shared semantic space. Do not fit a new PCA to these four sentences or truncate an incompatible embedding. The supplied encoder is `C10X/Qwen3-Embedding-TurboX`, now the generator default. Use `--model` to select an identical saved artifact or pinned local copy.

Encode each exact sentence below, one vector per sentence:

| JSON key | Sentence to encode |
| --- | --- |
| `rigor` | Nuanced statistical evidence, uncertainty intervals, epistemic caveats, preregistered hypotheses, and independent replication. |
| `outrage` | Moral condemnation, righteous anger, affective polarization, and existential alarm about a threatening out-group. |
| `absurdity` | Unfalsifiable conspiracies, secret omnipotent forces, surreal explanations, and extravagant hyperbole. |
| `simplicity` | A simple binary slogan: us versus them, one obvious answer, no caveats, no nuance. |

The helper uses the [official model2vec loading and encoding API](https://github.com/MinishLab/model2vec). Run in the same Python environment used for tweet generation:

```sh
python -m pip install model2vec numpy
python scripts/generate_trait_anchors.py --model /path/to/exact/saved/model
# Alternatively pass the exact Hugging Face owner/repository identifier.
```

If the tweet pipeline applied extra preprocessing or a saved projection, apply it at the marked location in the script. The helper checks output shape `(4, 256)`, rejects zero/nonfinite vectors, normalizes them, and writes `public/trait_anchors.json`. Its schema is an object with four keys `rigor`, `outrage`, `absurdity`, `simplicity`, each containing an array of exactly 256 numbers. The loader also validates and normalizes external anchors.

## Engine and model choices

- `core/data/loadDataset.ts`: validated asynchronous ingestion; failed loading never starts a synthetic simulation.
- `core/math/VectorOps.ts` / `vector.ts`: 256D operations. `pca.ts` uses matrix-free covariance multiplication and orthogonalized power iteration. Cosmos fits once to roots; the agent map fits once to initial worldviews. Both stay fixed within a run, preserving meaningful trails.
- `core/engine/EvolutionEngine.ts`: five candidates, with signed anchor perturbations and isotropic Gaussian residuals. The requested variance `v` is treated as variance, so both Gaussian standard deviations are `sqrt(v)`. Winner selection is argmax of the four weighted alignments.
- Agent preference weights are `[rho, epsilon, (1-rho)*epsilon, 1-rho]`. Platform defaults are `[0.1, 1, 0.4, 0.8]`; `lambda=0.65`. All platform terms and lambda are adjustable live.
- Rationality (0 rational, 1 irrational), virality, and root cosine distance use the requested formulas. Cognitive load uses `clamp(0.5 + 0.3*rigorAlignment - 0.3*simplicityAlignment, 0, 1)`. Mutation variance is inherited.
- The legacy `irrationality` field equals `rationality`, preserving downstream agent equations. Root IDs are `root_<tweet id>`; variants retain root and immediate parent IDs.
- Embedding mutations retain the original tweet text. The browser does not generate prose or pretend the text was rewritten.
- Community worldviews start near actual tweet embeddings with dimension-scaled jitter. Original tweet vectors are never altered to suit agents. Injections reintroduce matching roots.
- Cleanup preserves all roots, live ancestry, pending trust receipts and their ancestors, and recent variants. Unreferenced extinct branches move to an in-memory run archive after 160 ticks. The Extinct / unheld filter includes this archive; selection records and complete lineage remain inspectable until restart, a preset/structural reset, or page reload. Archive memory grows with the run.

## Views

Meme Cosmos renders all 200 stationary white/gray roots, smaller mutations, curved parent links, and projected trait anchors. The viewport is calibrated to real roots and anchors with manual zoom controls. Click a node or a meme-table row for its root text, generation, cosine drift, trait radar, all five candidate fitness scores, and platform/agent fitness contributions. The radar maps cosine −1 to its center, 0 to its middle ring, and +1 to its edge.

The velocity scatter groups held descendants by root: x is mean virality; y is mean `(root cosine distance / generation)`. This is an average displacement per generation, not cumulative path length or a time derivative. Colors indicate root rationality. Selection incentives do not guarantee migration or survival: bounded confidence still gates transmission, and the 2D projection omits most dimensions.

Agent semantic-space and trust-graph views, agent inspection, presets, pause, step, restart, and injection remain available. Dataset/config/seed together determine a reproducible run. Previous numerical results from the synthetic six-dimensional model do not apply to this dataset.

## Live mutation reporting

The activity table defaults to **Latest mutations**, displaying variant IDs and actual generation depth; **Original tweets** correctly remain at generation zero. **Circulating** includes only currently held memes. **Extinct / unheld** includes variants that were never adopted and archived variants with no remaining holders. Search and pagination cover all available records; clicking an archived variant restores its ancestral path in the cosmos and opens its lineage and selection details.

**Mutated this run** = all unique variants generated / (200 original tweets + all unique variants generated). Rejected and archived variants remain counted. **Currently circulating** separately reports held variants / all held unique memes. Neither percentage counts the four losing candidate proposals, nor repeated shares as new memes. Counts and highest generation reset with the run. Pause publishes the exact final tick to all panels, and Step pauses before advancing one tick.

## Adjustable monochrome workspace

The interface takes its black-and-white palette, large typography, numbered labels, and thin borders from the supplied visual reference, https://joshuadayal.com/. Rationality is now represented by a white-to-gray luminance scale across charts and canvases, with numeric values retained in inspectors and tables.

All workspace panels have independent width and height controls. Drag the right edge for width, the bottom edge for height, or the bottom-right corner for both. Tab to a resize handle and use arrow keys (20px), Shift + arrow keys (60px), or Home to reset that panel. Double-clicking a handle also resets its panel. Dimensions are saved in localStorage; **Reset layout** restores defaults without restarting the simulation. Panels wrap as widths change and adapt to narrow screens. Canvas backing sizes follow their panel via ResizeObserver.

## End-state embeddings and semantic interpretation

Select a meme, then use the **End-state embedding & meaning** panel:

- **Capture now** freezes the deepest descendant of the selected variant (including archived descendants; ties choose the most recently created). It does not mutate the selected vector in place.
- **Run & interpret** advances the current simulation for the requested number of additional ticks (1–10,000), pauses exactly at the target, captures that descendant, and calls the backend once. A reset cancels a scheduled capture. This is a tick horizon within one simulation run, not an ensemble of independent runs.
- Download the full 256D vector, root vector/text, generation, seed/configuration, captured tick, trait alignments, nearest source tweets, and any generated interpretation as JSON. Captures remain frozen while the simulation continues.

`C10X/Qwen3-Embedding-TurboX` is a static encoder, not a generative decoder. Its [model card](https://huggingface.co/C10X/Qwen3-Embedding-TurboX) describes PCA-reduced vocabulary embeddings and mean token pooling. There is no exact vector-to-sentence inverse exposed by that model. Arbitrary mutations may also leave the distribution of meaningful sentence embeddings.

The backend therefore retrieves the five nearest source tweets and measures trait changes from the root **server-side**, then asks a separate Qwen-compatible chat model for a clearly labelled interpretation. It does not claim that numeric coordinates are tokens or that generated prose re-embeds to the final vector. With no text backend configured, vector exports and nearest-neighbor evidence still work; interpretation reports a configuration error.

Copy `.env.example` to `.env.local`, then set:

```dotenv
SEMANTIC_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
SEMANTIC_MODEL=qwen-plus
SEMANTIC_API_KEY=your_server_side_key
```

Choose the endpoint/region and model available to your account; the example uses the [Qwen-compatible chat endpoint](https://docs.qwencloud.com/developer-guides/getting-started/first-api-call). An existing local OpenAI-compatible Qwen server also works: set its `/v1` base URL and exact served model name, with an empty key if it requires none. The embedding encoder ID must **not** be used as the chat model ID.

Restart `npm run dev` after changing environment variables. `POST /api/interpret` is served by Vite's backend middleware in development and `npm run preview` for local production-build verification. Static-only hosting does not provide this endpoint; deploy a Node backend using `createInterpreter` or route the API separately for production. Credentials remain server-side and `.env.local` is gitignored. Only the retrieved evidence is sent to the configured model provider; this happens on explicit interpretation actions, not on each mutation. Requests have payload/shape validation, a 60-second upstream timeout, and one simultaneous interpretation per server.
