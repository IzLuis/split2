import { describe, expect, it } from 'vitest';
import { computeShares } from './splits';

describe('computeShares', () => {
  it('computes equal split with cent remainder', () => {
    const result = computeShares('equal', 100, [
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
    ]);

    expect(result.error).toBeNull();
    expect(result.shares.map((share) => share.shareAmountCents)).toEqual([34, 33, 33]);
  });

  it('validates custom split totals', () => {
    const result = computeShares('custom', 1000, [
      { userId: 'u1', amount: 600 },
      { userId: 'u2', amount: 300 },
    ]);

    expect(result.error).toBe('Custom amounts must add up to the total amount.');
  });

  it('computes percentage split', () => {
    const result = computeShares('percentage', 1000, [
      { userId: 'u1', percentage: 60 },
      { userId: 'u2', percentage: 40 },
    ]);

    expect(result.error).toBeNull();
    expect(result.shares.map((share) => share.shareAmountCents)).toEqual([600, 400]);
  });
});
