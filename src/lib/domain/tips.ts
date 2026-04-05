import type { ComputedShare } from './splits';

export function parseTipPercentage(value: string | undefined | null): { value: number; error: string | null } {
  if (!value || !value.trim()) {
    return { value: 0, error: null };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: 0, error: 'Tip percentage must be 0 or greater.' };
  }

  if (parsed > 1000) {
    return { value: 0, error: 'Tip percentage is too large.' };
  }

  return { value: Number(parsed.toFixed(3)), error: null };
}

export function applyTipToShares(
  shares: ComputedShare[],
  tipPercentage: number,
): { shares: ComputedShare[]; tipAmountCents: number } {
  if (tipPercentage <= 0) {
    return { shares, tipAmountCents: 0 };
  }

  const subtotal = shares.reduce((acc, share) => acc + share.shareAmountCents, 0);
  const tipAmountCents = Math.round((subtotal * tipPercentage) / 100);

  if (tipAmountCents <= 0) {
    return { shares, tipAmountCents: 0 };
  }

  const weighted = shares.map((share, index) => {
    const rawTip = (share.shareAmountCents * tipAmountCents) / subtotal;
    const floorTip = Math.floor(rawTip);
    return {
      index,
      floorTip,
      fraction: rawTip - floorTip,
    };
  });

  const floorTotal = weighted.reduce((acc, item) => acc + item.floorTip, 0);
  let remainder = tipAmountCents - floorTotal;

  weighted.sort((a, b) => b.fraction - a.fraction);
  const tipByIndex = new Map<number, number>(weighted.map((item) => [item.index, item.floorTip]));

  let idx = 0;
  while (remainder > 0 && weighted.length > 0) {
    const item = weighted[idx % weighted.length];
    tipByIndex.set(item.index, (tipByIndex.get(item.index) ?? 0) + 1);
    remainder -= 1;
    idx += 1;
  }

  return {
    tipAmountCents,
    shares: shares.map((share, index) => ({
      ...share,
      shareAmountCents: share.shareAmountCents + (tipByIndex.get(index) ?? 0),
    })),
  };
}

export function applyEvenFeeToShares(
  shares: ComputedShare[],
  feeAmountCents: number,
): { shares: ComputedShare[]; assignedFeeAmountCents: number } {
  if (feeAmountCents <= 0 || shares.length === 0) {
    return { shares, assignedFeeAmountCents: 0 };
  }

  const sorted = shares
    .map((share, index) => ({ index, userId: share.userId }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const base = Math.floor(feeAmountCents / shares.length);
  let remainder = feeAmountCents - base * shares.length;
  const feeByIndex = new Map<number, number>();

  for (const item of sorted) {
    feeByIndex.set(item.index, base);
  }

  let idx = 0;
  while (remainder > 0) {
    const item = sorted[idx % sorted.length];
    feeByIndex.set(item.index, (feeByIndex.get(item.index) ?? 0) + 1);
    remainder -= 1;
    idx += 1;
  }

  return {
    assignedFeeAmountCents: feeAmountCents,
    shares: shares.map((share, index) => ({
      ...share,
      shareAmountCents: share.shareAmountCents + (feeByIndex.get(index) ?? 0),
    })),
  };
}
