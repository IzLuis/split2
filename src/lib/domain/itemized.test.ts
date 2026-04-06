import { describe, expect, it } from 'vitest';
import { computeItemizedExpenseBalances } from './itemized';

describe('computeItemizedExpenseBalances', () => {
  it('supports partially assigned itemized expenses and keeps unassigned visible', () => {
    const { result, error } = computeItemizedExpenseBalances(
      [
        {
          itemId: 'item-1',
          name: 'Burger',
          unitAmountCents: 1200,
          quantity: 1,
          isShared: false,
          sortOrder: 0,
        },
        {
          itemId: 'item-2',
          name: 'Soda',
          unitAmountCents: 400,
          quantity: 2,
          isShared: false,
          sortOrder: 1,
        },
      ],
      [{ itemId: 'item-1', userId: 'u1' }],
      10,
    );

    expect(error).toBeNull();
    expect(result).not.toBeNull();

    expect(result?.subtotalAmountCents).toBe(2000);
    expect(result?.tipAmountCents).toBe(200);
    expect(result?.totalAmountCents).toBe(2200);

    expect(result?.assignedBaseAmountCents).toBe(1200);
    expect(result?.assignedAmountCents).toBe(1320);
    expect(result?.unassignedAmountCents).toBe(880);
    expect(result?.status).toBe('partially_assigned');

    expect(result?.participantShares).toEqual([
      {
        userId: 'u1',
        shareAmountCents: 1320,
        sharePercentage: null,
        inputAmountCents: null,
      },
    ]);
  });

  it('splits shared item equally across claimants with deterministic cents', () => {
    const { result, error } = computeItemizedExpenseBalances(
      [
        {
          itemId: 'item-1',
          name: 'Pizza',
          unitAmountCents: 1000,
          quantity: 1,
          isShared: true,
          sortOrder: 0,
        },
      ],
      [
        { itemId: 'item-1', userId: 'u2' },
        { itemId: 'item-1', userId: 'u1' },
        { itemId: 'item-1', userId: 'u3' },
      ],
      0,
    );

    expect(error).toBeNull();
    expect(result?.assignedAmountCents).toBe(1000);
    expect(result?.unassignedAmountCents).toBe(0);
    expect(result?.status).toBe('fully_assigned');

    expect(result?.participantShares).toEqual([
      {
        userId: 'u1',
        shareAmountCents: 334,
        sharePercentage: null,
        inputAmountCents: null,
      },
      {
        userId: 'u2',
        shareAmountCents: 333,
        sharePercentage: null,
        inputAmountCents: null,
      },
      {
        userId: 'u3',
        shareAmountCents: 333,
        sharePercentage: null,
        inputAmountCents: null,
      },
    ]);
  });

  it('allows more claimers than quantity on shared items', () => {
    const { result, error } = computeItemizedExpenseBalances(
      [
        {
          itemId: 'item-1',
          name: 'Soda pack',
          unitAmountCents: 250,
          quantity: 2,
          isShared: true,
          sortOrder: 0,
        },
      ],
      [
        { itemId: 'item-1', userId: 'u1' },
        { itemId: 'item-1', userId: 'u2' },
        { itemId: 'item-1', userId: 'u3' },
        { itemId: 'item-1', userId: 'u4' },
      ],
      0,
    );

    expect(error).toBeNull();
    expect(result?.subtotalAmountCents).toBe(500);
    expect(result?.assignedAmountCents).toBe(500);
    expect(result?.participantShares).toEqual([
      {
        userId: 'u1',
        shareAmountCents: 125,
        sharePercentage: null,
        inputAmountCents: null,
      },
      {
        userId: 'u2',
        shareAmountCents: 125,
        sharePercentage: null,
        inputAmountCents: null,
      },
      {
        userId: 'u3',
        shareAmountCents: 125,
        sharePercentage: null,
        inputAmountCents: null,
      },
      {
        userId: 'u4',
        shareAmountCents: 125,
        sharePercentage: null,
        inputAmountCents: null,
      },
    ]);
  });

  it('rejects multiple claimants for non-shared items', () => {
    const { result, error } = computeItemizedExpenseBalances(
      [
        {
          itemId: 'item-1',
          name: 'Burger',
          unitAmountCents: 1200,
          quantity: 1,
          isShared: false,
          sortOrder: 0,
        },
      ],
      [
        { itemId: 'item-1', userId: 'u1' },
        { itemId: 'item-1', userId: 'u2' },
      ],
      0,
    );

    expect(result).toBeNull();
    expect(error).toContain('not shared');
  });

  it('supports open itemized expenses with zero claims', () => {
    const { result, error } = computeItemizedExpenseBalances(
      [
        {
          itemId: 'item-1',
          name: 'Pizza',
          unitAmountCents: 1800,
          quantity: 1,
          isShared: true,
          sortOrder: 0,
        },
      ],
      [],
      15,
    );

    expect(error).toBeNull();
    expect(result?.assignedAmountCents).toBe(0);
    expect(result?.unassignedAmountCents).toBe(result?.totalAmountCents);
    expect(result?.status).toBe('open');
  });

  it('splits delivery fee only across unique claimed users', () => {
    const { result, error } = computeItemizedExpenseBalances(
      [
        {
          itemId: 'item-1',
          name: 'Burger',
          unitAmountCents: 1000,
          quantity: 1,
          isShared: false,
          sortOrder: 0,
        },
        {
          itemId: 'item-2',
          name: 'Fries',
          unitAmountCents: 500,
          quantity: 1,
          isShared: true,
          sortOrder: 1,
        },
      ],
      [
        { itemId: 'item-1', userId: 'u1' },
        { itemId: 'item-2', userId: 'u1' },
        { itemId: 'item-2', userId: 'u2' },
      ],
      0,
      101,
    );

    expect(error).toBeNull();
    expect(result?.deliveryFeeAmountCents).toBe(101);
    expect(result?.assignedAmountCents).toBe(1601);
    expect(result?.unassignedAmountCents).toBe(0);
    expect(result?.participantShares).toEqual([
      {
        userId: 'u1',
        shareAmountCents: 1301,
        sharePercentage: null,
        inputAmountCents: null,
      },
      {
        userId: 'u2',
        shareAmountCents: 300,
        sharePercentage: null,
        inputAmountCents: null,
      },
    ]);
  });
});
