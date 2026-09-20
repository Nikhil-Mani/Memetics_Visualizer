"""Encode trait anchors with the exact model2vec artifact used for the tweets."""
import argparse
import json
from pathlib import Path

PHRASES = {
    'rigor': 'Nuanced statistical evidence, uncertainty intervals, epistemic caveats, preregistered hypotheses, and independent replication.',
    'outrage': 'Moral condemnation, righteous anger, affective polarization, and existential alarm about a threatening out-group.',
    'absurdity': 'Unfalsifiable conspiracies, secret omnipotent forces, surreal explanations, and extravagant hyperbole.',
    'simplicity': 'A simple binary slogan: us versus them, one obvious answer, no caveats, no nuance.',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', default='C10X/Qwen3-Embedding-TurboX', help='Exact Qwen3-Embedding-TurboX model2vec directory or Hugging Face repository ID used for the tweets')
    parser.add_argument('--output', default='public/trait_anchors.json')
    args = parser.parse_args()
    import numpy as np
    from model2vec import StaticModel
    model = StaticModel.from_pretrained(args.model)
    # If tweet generation used additional preprocessing or a saved projection,
    # apply the IDENTICAL transformation here, before normalization.
    vectors = np.asarray(model.encode(list(PHRASES.values())), dtype=np.float64)
    if vectors.shape != (4, 256):
        raise ValueError(f'Expected (4, 256), got {vectors.shape}. Use the same saved model/projection as the tweets; do not truncate or fit a fresh PCA.')
    lengths = np.linalg.norm(vectors, axis=1, keepdims=True)
    if not np.isfinite(vectors).all() or (lengths < 1e-12).any():
        raise ValueError('Model produced nonfinite or zero vectors')
    vectors /= lengths
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dict(zip(PHRASES, vectors.tolist())), indent=2) + '\n')
    print(f'Wrote {output}: four normalized 256D anchors')


if __name__ == '__main__':
    main()
