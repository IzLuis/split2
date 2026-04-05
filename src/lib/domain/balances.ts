export type LedgerExpense = {
  id: string;
  paidBy: string;
  totalAmountCents: number;
  splits: Array<{
    userId: string;
    amountCents: number;
  }>;
};

export type LedgerSettlement = {
  payerId: string;
  receiverId: string;
  amountCents: number;
};

export type BalanceResult = {
  netBalances: Record<string, number>;
  statements: Array<{
    fromUserId: string;
    toUserId: string;
    amountCents: number;
  }>;
};

export type BalanceMode = 'normal' | 'reduced';

type Matrix = Map<string, Map<string, number>>;

function getEdge(matrix: Matrix, from: string, to: string) {
  return matrix.get(from)?.get(to) ?? 0;
}

function setEdge(matrix: Matrix, from: string, to: string, value: number) {
  if (value <= 0) {
    const row = matrix.get(from);
    if (!row) {
      return;
    }
    row.delete(to);
    if (row.size === 0) {
      matrix.delete(from);
    }
    return;
  }

  const row = matrix.get(from) ?? new Map<string, number>();
  row.set(to, value);
  matrix.set(from, row);
}

function addObligation(matrix: Matrix, debtor: string, creditor: string, amountCents: number) {
  if (debtor === creditor || amountCents <= 0) {
    return;
  }

  const opposite = getEdge(matrix, creditor, debtor);
  if (opposite >= amountCents) {
    setEdge(matrix, creditor, debtor, opposite - amountCents);
    return;
  }

  if (opposite > 0) {
    setEdge(matrix, creditor, debtor, 0);
  }

  const current = getEdge(matrix, debtor, creditor);
  setEdge(matrix, debtor, creditor, current + amountCents - opposite);
}

export function calculateGroupBalances(
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
  mode: BalanceMode = 'normal',
): BalanceResult {
  const obligations: Matrix = new Map();
  const userIds = new Set<string>();

  for (const expense of expenses) {
    userIds.add(expense.paidBy);
    for (const split of expense.splits) {
      userIds.add(split.userId);
      addObligation(obligations, split.userId, expense.paidBy, split.amountCents);
    }
  }

  for (const settlement of settlements) {
    userIds.add(settlement.payerId);
    userIds.add(settlement.receiverId);
    // Settlement payer paid receiver, so this offsets payer->receiver debt.
    addObligation(obligations, settlement.receiverId, settlement.payerId, settlement.amountCents);
  }

  const netBalances: Record<string, number> = {};
  for (const userId of userIds) {
    netBalances[userId] = 0;
  }

  for (const [from, row] of obligations.entries()) {
    for (const [to, amount] of row.entries()) {
      netBalances[from] -= amount;
      netBalances[to] += amount;
    }
  }

  const statements: BalanceResult['statements'] =
    mode === 'normal'
      ? []
      : buildReducedTransferStatements(netBalances);

  if (mode === 'normal') {
    for (const [from, row] of obligations.entries()) {
      for (const [to, amount] of row.entries()) {
        statements.push({
          fromUserId: from,
          toUserId: to,
          amountCents: amount,
        });
      }
    }
  }

  statements.sort((a, b) => b.amountCents - a.amountCents);

  return { netBalances, statements };
}

function buildReducedTransferStatements(netBalances: Record<string, number>) {
  const debtors = Object.entries(netBalances)
    .filter(([, amount]) => amount < 0)
    .map(([userId, amount]) => ({ userId, amountCents: -amount }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const creditors = Object.entries(netBalances)
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amountCents: amount }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const statements: Array<{
    fromUserId: string;
    toUserId: string;
    amountCents: number;
  }> = [];

  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const transferAmount = Math.min(debtor.amountCents, creditor.amountCents);

    statements.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amountCents: transferAmount,
    });

    debtor.amountCents -= transferAmount;
    creditor.amountCents -= transferAmount;

    if (debtor.amountCents === 0) {
      debtorIndex += 1;
    }
    if (creditor.amountCents === 0) {
      creditorIndex += 1;
    }
  }

  return statements;
}
