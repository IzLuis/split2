import type { ComputedShare } from './splits';
import { applyEvenFeeToShares, applyTipToShares } from './tips';

export type ItemizationStatus = 'not_itemized' | 'open' | 'partially_assigned' | 'fully_assigned';
type ActiveItemizationStatus = Exclude<ItemizationStatus, 'not_itemized'>;

export type ItemizedExpenseItemInput = {
  itemId: string;
  name: string;
  unitAmountCents: number;
  quantity: number;
  isShared: boolean;
  sortOrder: number;
  notes?: string | null;
};

export type ItemizedExpenseClaimInput = {
  itemId: string;
  userId: string;
};

export type ItemizedClaimBreakdown = {
  itemId: string;
  userId: string;
  amountCents: number;
};

export type ItemizedComputationResult = {
  subtotalAmountCents: number;
  tipAmountCents: number;
  deliveryFeeAmountCents: number;
  totalAmountCents: number;
  assignedBaseAmountCents: number;
  assignedAmountCents: number;
  unassignedAmountCents: number;
  status: ActiveItemizationStatus;
  participantShares: ComputedShare[];
  claimBreakdown: ItemizedClaimBreakdown[];
  itemSummaries: Array<{
    itemId: string;
    lineAmountCents: number;
    assignedAmountCents: number;
    unassignedAmountCents: number;
    claimedByUserIds: string[];
  }>;
};

function splitEqualAcrossUsers(totalAmountCents: number, userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, number>();
  }

  const sorted = [...new Set(userIds)].sort();
  const base = Math.floor(totalAmountCents / sorted.length);
  let remainder = totalAmountCents - base * sorted.length;

  const result = new Map<string, number>();
  for (const userId of sorted) {
    result.set(userId, base);
  }

  let index = 0;
  while (remainder > 0) {
    const userId = sorted[index % sorted.length];
    result.set(userId, (result.get(userId) ?? 0) + 1);
    remainder -= 1;
    index += 1;
  }

  return result;
}

export function getItemizationStatus(
  assignedAmountCents: number,
  unassignedAmountCents: number,
): ActiveItemizationStatus {
  if (assignedAmountCents <= 0) {
    return 'open';
  }
  if (unassignedAmountCents <= 0) {
    return 'fully_assigned';
  }
  return 'partially_assigned';
}

export function computeItemizedExpenseBalances(
  items: ItemizedExpenseItemInput[],
  claims: ItemizedExpenseClaimInput[],
  tipPercentage: number,
  deliveryFeeCents = 0,
): { result: ItemizedComputationResult | null; error: string | null } {
  const claimUsersByItem = new Map<string, Set<string>>();
  for (const claim of claims) {
    const current = claimUsersByItem.get(claim.itemId) ?? new Set<string>();
    current.add(claim.userId);
    claimUsersByItem.set(claim.itemId, current);
  }

  const baseByUser = new Map<string, number>();
  const claimBreakdown: ItemizedClaimBreakdown[] = [];
  const itemSummaries: ItemizedComputationResult['itemSummaries'] = [];

  let subtotalAmountCents = 0;
  let assignedBaseAmountCents = 0;

  for (const item of items) {
    const lineAmountCents = item.unitAmountCents * item.quantity;
    subtotalAmountCents += lineAmountCents;

    const userIds = [...(claimUsersByItem.get(item.itemId) ?? new Set<string>())];
    const assignedByUser = new Map<string, number>();

    if (!item.isShared) {
      if (userIds.length > 1) {
        return {
          result: null,
          error: `Item \"${item.name}\" is not shared and can only have one claimant.`,
        };
      }

      if (userIds.length === 1) {
        assignedByUser.set(userIds[0], lineAmountCents);
      }
    } else if (userIds.length > 0) {
      const split = splitEqualAcrossUsers(lineAmountCents, userIds);
      for (const [userId, amountCents] of split.entries()) {
        assignedByUser.set(userId, amountCents);
      }
    }

    let itemAssignedAmount = 0;
    for (const [userId, amountCents] of assignedByUser.entries()) {
      itemAssignedAmount += amountCents;
      baseByUser.set(userId, (baseByUser.get(userId) ?? 0) + amountCents);
      claimBreakdown.push({ itemId: item.itemId, userId, amountCents });
    }

    assignedBaseAmountCents += itemAssignedAmount;

    itemSummaries.push({
      itemId: item.itemId,
      lineAmountCents,
      assignedAmountCents: itemAssignedAmount,
      unassignedAmountCents: lineAmountCents - itemAssignedAmount,
      claimedByUserIds: [...assignedByUser.keys()].sort(),
    });
  }

  const tipAmountCents = tipPercentage > 0 ? Math.round((subtotalAmountCents * tipPercentage) / 100) : 0;
  const normalizedDeliveryFee = Math.max(0, Math.floor(deliveryFeeCents));
  const totalAmountCents = subtotalAmountCents + tipAmountCents + normalizedDeliveryFee;

  const baseShares: ComputedShare[] = [...baseByUser.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([userId, shareAmountCents]) => ({
      userId,
      shareAmountCents,
      sharePercentage: null,
      inputAmountCents: null,
    }));

  const tippedShares = applyTipToShares(baseShares, tipPercentage);
  const sharesWithFee = applyEvenFeeToShares(tippedShares.shares, normalizedDeliveryFee);
  const participantShares = sharesWithFee.shares;
  const assignedAmountCents = participantShares.reduce((acc, share) => acc + share.shareAmountCents, 0);
  const unassignedAmountCents = totalAmountCents - assignedAmountCents;

  return {
    error: null,
    result: {
      subtotalAmountCents,
      tipAmountCents,
      deliveryFeeAmountCents: normalizedDeliveryFee,
      totalAmountCents,
      assignedBaseAmountCents,
      assignedAmountCents,
      unassignedAmountCents,
      status: getItemizationStatus(assignedAmountCents, unassignedAmountCents),
      participantShares,
      claimBreakdown,
      itemSummaries,
    },
  };
}
