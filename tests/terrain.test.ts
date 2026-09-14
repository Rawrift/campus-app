import { describe, it, expect } from 'vitest';
import { faces } from '@/render/terrain';

/*
 * The ground was invisible for the whole first pass of the art direction.
 *
 * Every horizontal terrain quad -- floor, path, mire, the surround beyond the
 * playable area and the wall tops -- was written out with its corners in
 * clockwise order seen from above while carrying an upward normal, so with
 * `side: FrontSide` all of it was back-face culled. Nothing errored and nothing
 * looked missing: the background showed through where the ground should be, and
 * a uniform background reads exactly like a flat, untextured floor. It was only
 * found by hiding the terrain meshes one at a time and noticing that hiding the
 * floor changed nothing.
 *
 * `quad` now derives its triangle order from the supplied normal instead of
 * trusting the corner order. These cover the predicate that does it.
 */
describe('quad winding', () => {
  const up: [number, number, number] = [0, 1, 0];

  it('accepts a floor quad wound counter-clockwise seen from above', () => {
    expect(faces([0, 0, 1], [1, 0, 1], [1, 0, 0], up)).toBe(true);
  });

  it('rejects the clockwise order that culled the ground', () => {
    expect(faces([0, 0, 0], [1, 0, 0], [1, 0, 1], up)).toBe(false);
  });

  it('is independent of the height the quad sits at', () => {
    for (const y of [-0.05, 0, 1.35, 3.4]) {
      expect(faces([0, y, 1], [1, y, 1], [1, y, 0], up)).toBe(true);
      expect(faces([0, y, 0], [1, y, 0], [1, y, 1], up)).toBe(false);
    }
  });

  it('orients wall faces against their own normal, not against up', () => {
    // The -Z face, exactly as the terrain builder emits it: bottom-left,
    // top-left, top-right, bottom-right.
    expect(faces([0, 0, 0], [0, 3, 0], [1, 3, 0], [0, 0, -1])).toBe(true);
    // The same corners with a +Z normal must be reported as facing away.
    expect(faces([0, 0, 0], [0, 3, 0], [1, 3, 0], [0, 0, 1])).toBe(false);
  });

  it('treats a degenerate quad as already facing the normal', () => {
    // Zero area gives a zero cross product; the caller must not flip it.
    expect(faces([0, 0, 0], [0, 0, 0], [1, 0, 0], up)).toBe(true);
  });
});
