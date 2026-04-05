import { describe, expect, it } from 'vitest';
import { calculateGroupBalances } from './balances';

describe('calculateGroupBalances', () => {
  it('calculates simple equal expense', () => {
    const result = calculateGroupBalances(
      [
        {
          id: 'exp-1',
          paidBy: 'u1',
          totalAmountCents: 3000,
          splits: [
            { userId: 'u1', amountCents: 1000 },
            { userId: 'u2', amountCents: 1000 },
            { userId: 'u3', amountCents: 1000 },
          ],
        },
      ],
      [],
    );

    expect(result.netBalances.u1).toBe(2000);
    expect(result.netBalances.u2).toBe(-1000);
    expect(result.netBalances.u3).toBe(-1000);
    expect(result.statements).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amountCents: 1000 },
      { fromUserId: 'u3', toUserId: 'u1', amountCents: 1000 },
    ]);
  });

  it('applies settlement correctly', () => {
    const result = calculateGroupBalances(
      [
        {
          id: 'exp-1',
          paidBy: 'u1',
          totalAmountCents: 2000,
          splits: [
            { userId: 'u1', amountCents: 1000 },
            { userId: 'u2', amountCents: 1000 },
          ],
        },
      ],
      [{ payerId: 'u2', receiverId: 'u1', amountCents: 600 }],
    );

    expect(result.netBalances.u1).toBe(400);
    expect(result.netBalances.u2).toBe(-400);
    expect(result.statements).toEqual([{ fromUserId: 'u2', toUserId: 'u1', amountCents: 400 }]);
  });

  it('keeps zero-sum invariant', () => {
    const result = calculateGroupBalances(
      [
        {
          id: 'exp-1',
          paidBy: 'u1',
          totalAmountCents: 5000,
          splits: [
            { userId: 'u1', amountCents: 2500 },
            { userId: 'u2', amountCents: 1500 },
            { userId: 'u3', amountCents: 1000 },
          ],
        },
      ],
      [{ payerId: 'u2', receiverId: 'u1', amountCents: 700 }],
    );

    const total = Object.values(result.netBalances).reduce((acc, amount) => acc + amount, 0);
    expect(total).toBe(0);
  });
});
