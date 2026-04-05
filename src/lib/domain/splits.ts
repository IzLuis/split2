import type { SplitType } from '@/lib/types';

export type ParticipantInput = {
  userId: string;
  amount?: number;
  percentage?: number;
};

export type ComputedShare = {
  userId: string;
  shareAmountCents: number;
  sharePercentage: number | null;
  inputAmountCents: number | null;
};

function distributeRemainder(baseShares: number[], total: number) {
  const sum = baseShares.reduce((acc, value) => acc + value, 0);
  let remainder = total - sum;
  const result = [...baseShares];
  let index = 0;

  while (remainder > 0) {
    result[index] += 1;
    remainder -= 1;
    index = (index + 1) % result.length;
  }

  return result;
}

export function computeShares(
  splitType: SplitType,
  totalAmountCents: number,
  participants: ParticipantInput[],
): { shares: ComputedShare[]; error: string | null } {
  if (participants.length === 0) {
    return { shares: [], error: 'At least one participant is required.' };
  }

  if (splitType === 'equal') {
    const base = Math.floor(totalAmountCents / participants.length);
    const baseShares = Array.from({ length: participants.length }, () => base);
    const sharesWithRemainder = distributeRemainder(baseShares, totalAmountCents);

    return {
      error: null,
      shares: participants.map((participant, index) => ({
        userId: participant.userId,
        shareAmountCents: sharesWithRemainder[index],
        sharePercentage: null,
        inputAmountCents: null,
      })),
    };
  }

  if (splitType === 'custom') {
    const amounts = participants.map((participant) => participant.amount ?? -1);
    if (amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
      return { shares: [], error: 'Every participant must have a valid custom amount.' };
    }

    const sum = amounts.reduce((acc, value) => acc + value, 0);
    if (sum !== totalAmountCents) {
      return {
        shares: [],
        error: 'Custom amounts must add up to the total amount.',
      };
    }

    return {
      error: null,
      shares: participants.map((participant) => ({
        userId: participant.userId,
        shareAmountCents: participant.amount ?? 0,
        sharePercentage: null,
        inputAmountCents: participant.amount ?? 0,
      })),
    };
  }

  const percentages = participants.map((participant) => participant.percentage ?? -1);
  if (percentages.some((value) => !Number.isFinite(value) || value < 0)) {
    return { shares: [], error: 'Every participant must have a valid percentage.' };
  }

  const percentageSum = percentages.reduce((acc, value) => acc + value, 0);
  if (Math.abs(percentageSum - 100) > 0.001) {
    return { shares: [], error: 'Percentages must add up to 100.' };
  }

  const rawShares = participants.map((participant) => {
    const percentage = participant.percentage ?? 0;
    const rawAmount = (totalAmountCents * percentage) / 100;
    return {
      userId: participant.userId,
      percentage,
      floor: Math.floor(rawAmount),
      fraction: rawAmount - Math.floor(rawAmount),
    };
  });

  const floorSum = rawShares.reduce((acc, item) => acc + item.floor, 0);
  let remainder = totalAmountCents - floorSum;

  rawShares.sort((a, b) => b.fraction - a.fraction);

  const byUserId = new Map<string, number>();
  for (const item of rawShares) {
    byUserId.set(item.userId, item.floor);
  }

  let idx = 0;
  while (remainder > 0 && rawShares.length > 0) {
    const item = rawShares[idx % rawShares.length];
    byUserId.set(item.userId, (byUserId.get(item.userId) ?? 0) + 1);
    remainder -= 1;
    idx += 1;
  }

  return {
    error: null,
    shares: participants.map((participant) => {
      const percentage = participant.percentage ?? 0;
      return {
        userId: participant.userId,
        shareAmountCents: byUserId.get(participant.userId) ?? 0,
        sharePercentage: Number(percentage.toFixed(3)),
        inputAmountCents: null,
      };
    }),
  };
}
