import { describe, it, expect } from 'vitest';
import { moveItem } from './move-item';

describe('moveItem', () => {
  it('moves an element up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });
  it('moves an element down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });
  it('clamps out-of-range targets and is a no-op for equal indices', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
