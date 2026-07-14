import { describe, it, expect } from 'vitest';
import { assignAllToItems } from './assign-all';

const item = (...ids: string[]) => ({ name: 'x', assigned: new Set(ids) });

describe('assignAllToItems', () => {
  it('adds the member to every item when on none', () => {
    const next = assignAllToItems([item(), item()], 'a');
    expect(next.map((it) => [...it.assigned])).toEqual([['a'], ['a']]);
  });

  it('adds the member to every item when on only some', () => {
    const next = assignAllToItems([item('a'), item()], 'a');
    expect(next.every((it) => it.assigned.has('a'))).toBe(true);
  });

  it('removes the member from every item when on all', () => {
    const next = assignAllToItems([item('a', 'b'), item('a')], 'a');
    expect(next.map((it) => [...it.assigned])).toEqual([['b'], []]);
  });

  it('is a no-op for an empty list', () => {
    expect(assignAllToItems([], 'a')).toEqual([]);
  });

  it('does not mutate the input items', () => {
    const input = [item('a')];
    assignAllToItems(input, 'a');
    expect([...input[0]!.assigned]).toEqual(['a']);
  });
});
