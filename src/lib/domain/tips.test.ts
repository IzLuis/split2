import { describe, expect, it } from 'vitest';
import { applyEvenFeeToShares } from './tips';

describe('applyEvenFeeToShares', () => {
  it('splits fee evenly with deterministic remainder order by user id', () => {
    const { shares, assignedFeeAmountCents } = applyEvenFeeToShares(
      [
        { userId: 'u2', shareAmountCents: 500, sharePercentage: null, inputAmountCents: null },
        { userId: 'u1', shareAmountCents: 500, sharePercentage: null, inputAmountCents: null },
        { userId: 'u3', shareAmountCents: 500, sharePercentage: null, inputAmountCents: null },
      ],
      5,
    );

    expect(assignedFeeAmountCents).toBe(5);
    expect(shares).toEqual([
      { userId: 'u2', shareAmountCents: 502, sharePercentage: null, inputAmountCents: null },
      { userId: 'u1', shareAmountCents: 502, sharePercentage: null, inputAmountCents: null },
      { userId: 'u3', shareAmountCents: 501, sharePercentage: null, inputAmountCents: null },
    ]);
  });

  it('does not assign fee when there are no shares', () => {
    const { shares, assignedFeeAmountCents } = applyEvenFeeToShares([], 300);

    expect(assignedFeeAmountCents).toBe(0);
    expect(shares).toEqual([]);
  });
});
