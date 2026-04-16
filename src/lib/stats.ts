import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type CurrencyTotals = Record<string, number>;

type MinimalProfile = {
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
};

export type ProfileStats = {
  groupsCount: number;
  ownedGroupsCount: number;
  createdExpensesCount: number;
  itemizedExpensesCount: number;
  settlementsPaidCount: number;
  settlementsReceivedCount: number;
  ocrScansCount: number;
  paidTotalsByCurrency: CurrencyTotals;
  shareTotalsByCurrency: CurrencyTotals;
  netTotalsByCurrency: CurrencyTotals;
  largestExpense: {
    title: string;
    amountCents: number;
    currency: string;
    date: string;
  } | null;
  favoriteSplitType: 'equal' | 'custom' | 'percentage' | null;
};

export type GlobalAdminStats = {
  usersCount: number;
  dummyUsersCount: number;
  groupsCount: number;
  activeMembershipsCount: number;
  expensesCount: number;
  itemizedExpensesCount: number;
  settlementsCount: number;
  pendingInvitesCount: number;
  pendingFriendRequestsCount: number;
  ocrScansCount: number;
  expenseTotalsByCurrency: CurrencyTotals;
  settlementTotalsByCurrency: CurrencyTotals;
  largestExpense: {
    amountCents: number;
    currency: string;
    groupName: string;
  } | null;
  topSpenders: Array<{
    userId: string;
    label: string;
    expensesCount: number;
    totalsByCurrency: CurrencyTotals;
  }>;
  busiestGroups: Array<{
    groupId: string;
    label: string;
    expensesCount: number;
    totalsByCurrency: CurrencyTotals;
  }>;
};

function normalizeLower(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeNoSpaceLower(value: string | null | undefined) {
  return normalizeLower(value).replace(/\s+/g, '');
}

function addCurrencyAmount(target: CurrencyTotals, currency: string | null | undefined, amountCents: number) {
  const code = String(currency ?? '').trim().toUpperCase();
  if (!code || !Number.isFinite(amountCents)) {
    return;
  }
  target[code] = (target[code] ?? 0) + Math.round(amountCents);
}

function subtractCurrencyAmount(target: CurrencyTotals, currency: string | null | undefined, amountCents: number) {
  const code = String(currency ?? '').trim().toUpperCase();
  if (!code || !Number.isFinite(amountCents)) {
    return;
  }
  target[code] = (target[code] ?? 0) - Math.round(amountCents);
}

export function sortCurrencyTotals(totals: CurrencyTotals) {
  return Object.entries(totals)
    .filter((entry) => Number.isFinite(entry[1]) && entry[1] !== 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export function isIzLuisAdmin(profile: MinimalProfile | null | undefined) {
  const username = normalizeLower(profile?.username);
  const fullNameNoSpace = normalizeNoSpaceLower(profile?.full_name);
  const emailLocal = normalizeLower(profile?.email).split('@')[0] ?? '';

  return username === 'izluis' || fullNameNoSpace === 'izluis' || emailLocal === 'izluis';
}

function isMissingLeftAtColumnError(message: string | undefined) {
  return (message ?? '').includes('column group_members.left_at does not exist');
}

type GroupMembershipRow = {
  group_id: string;
  role: 'owner' | 'member';
  left_at?: string | null;
  accepted_at?: string | null;
};

async function getGroupMembershipRowsForUser(supabase: SupabaseClient, userId: string) {
  const withLeftAt = await supabase
    .from('group_members')
    .select('group_id, role, left_at, accepted_at')
    .eq('user_id', userId)
    .is('left_at', null);

  if (withLeftAt.error && isMissingLeftAtColumnError(withLeftAt.error.message)) {
    const fallback = await supabase
      .from('group_members')
      .select('group_id, role, accepted_at')
      .eq('user_id', userId);
    if (fallback.error) {
      throw new Error(`Could not load group memberships: ${fallback.error.message}`);
    }
    return (fallback.data ?? []).map((row) => ({
      group_id: row.group_id,
      role: row.role,
      accepted_at: row.accepted_at,
      left_at: null,
    })) as GroupMembershipRow[];
  }

  if (withLeftAt.error) {
    throw new Error(`Could not load group memberships: ${withLeftAt.error.message}`);
  }

  return (withLeftAt.data ?? []).map((row) => ({
    group_id: row.group_id,
    role: row.role,
    accepted_at: row.accepted_at,
    left_at: row.left_at,
  })) as GroupMembershipRow[];
}

async function getAllGroupMembershipRowsForAdmin(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const withLeftAt = await admin
    .from('group_members')
    .select('group_id, user_id, role, accepted_at, left_at');

  if (withLeftAt.error && isMissingLeftAtColumnError(withLeftAt.error.message)) {
    const fallback = await admin
      .from('group_members')
      .select('group_id, user_id, role, accepted_at');
    if (fallback.error) {
      throw new Error(`Could not load global memberships: ${fallback.error.message}`);
    }
    return (fallback.data ?? []).map((row) => ({
      group_id: row.group_id,
      user_id: row.user_id,
      role: row.role,
      accepted_at: row.accepted_at,
      left_at: null,
    })) as Array<{
      group_id: string;
      user_id: string;
      role: 'owner' | 'member';
      accepted_at: string | null;
      left_at?: string | null;
    }>;
  }

  if (withLeftAt.error) {
    throw new Error(`Could not load global memberships: ${withLeftAt.error.message}`);
  }

  return (withLeftAt.data ?? []).map((row) => ({
    group_id: row.group_id,
    user_id: row.user_id,
    role: row.role,
    accepted_at: row.accepted_at,
    left_at: row.left_at,
  })) as Array<{
    group_id: string;
    user_id: string;
    role: 'owner' | 'member';
    accepted_at: string | null;
    left_at?: string | null;
  }>;
}

export async function getProfileStats(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileStats> {
  const memberships = await getGroupMembershipRowsForUser(supabase, userId);
  const groupsCount = new Set(memberships.map((membership) => membership.group_id)).size;
  const ownedGroupsCount = memberships.filter((membership) => membership.role === 'owner').length;

  const [createdExpensesResult, paidExpensesResult, settlementsPaidResult, settlementsReceivedResult, sharesResult, ocrCountResult] =
    await Promise.all([
      supabase
        .from('expenses')
        .select('title, total_amount_cents, currency, expense_date, split_type, is_itemized')
        .eq('created_by', userId),
      supabase
        .from('expenses')
        .select('total_amount_cents, currency')
        .eq('paid_by', userId),
      supabase
        .from('settlements')
        .select('amount_cents, currency')
        .eq('payer_id', userId),
      supabase
        .from('settlements')
        .select('amount_cents, currency')
        .eq('receiver_id', userId),
      supabase
        .from('expense_participants')
        .select('expense_id, share_amount_cents')
        .eq('user_id', userId),
      supabase
        .from('receipt_ocr_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

  if (createdExpensesResult.error) {
    throw new Error(`Could not load created expenses stats: ${createdExpensesResult.error.message}`);
  }
  if (paidExpensesResult.error) {
    throw new Error(`Could not load paid expenses stats: ${paidExpensesResult.error.message}`);
  }
  if (settlementsPaidResult.error) {
    throw new Error(`Could not load paid settlements stats: ${settlementsPaidResult.error.message}`);
  }
  if (settlementsReceivedResult.error) {
    throw new Error(`Could not load received settlements stats: ${settlementsReceivedResult.error.message}`);
  }
  if (sharesResult.error) {
    throw new Error(`Could not load participant shares stats: ${sharesResult.error.message}`);
  }
  if (ocrCountResult.error) {
    throw new Error(`Could not load OCR usage stats: ${ocrCountResult.error.message}`);
  }

  const createdExpenses = createdExpensesResult.data ?? [];
  const paidExpenses = paidExpensesResult.data ?? [];
  const settlementsPaid = settlementsPaidResult.data ?? [];
  const settlementsReceived = settlementsReceivedResult.data ?? [];
  const shareRows = sharesResult.data ?? [];
  const ocrScansCount = ocrCountResult.count ?? 0;

  const shareExpenseIds = [...new Set(shareRows.map((row) => row.expense_id))];
  const sharesByCurrency: CurrencyTotals = {};
  if (shareExpenseIds.length > 0) {
    const { data: shareCurrencies, error: shareCurrenciesError } = await supabase
      .from('expenses')
      .select('id, currency')
      .in('id', shareExpenseIds);

    if (shareCurrenciesError) {
      throw new Error(`Could not load share currencies stats: ${shareCurrenciesError.message}`);
    }

    const currencyByExpenseId = new Map(
      (shareCurrencies ?? []).map((expense) => [String(expense.id), String(expense.currency)]),
    );

    for (const share of shareRows) {
      const currency = currencyByExpenseId.get(String(share.expense_id));
      if (!currency) continue;
      addCurrencyAmount(sharesByCurrency, currency, Number(share.share_amount_cents));
    }
  }

  const paidTotalsByCurrency: CurrencyTotals = {};
  for (const expense of paidExpenses) {
    addCurrencyAmount(
      paidTotalsByCurrency,
      String(expense.currency),
      Number(expense.total_amount_cents),
    );
  }

  const netTotalsByCurrency: CurrencyTotals = {};
  for (const [currency, value] of Object.entries(paidTotalsByCurrency)) {
    addCurrencyAmount(netTotalsByCurrency, currency, value);
  }
  for (const [currency, value] of Object.entries(sharesByCurrency)) {
    subtractCurrencyAmount(netTotalsByCurrency, currency, value);
  }
  for (const settlement of settlementsPaid) {
    subtractCurrencyAmount(
      netTotalsByCurrency,
      String(settlement.currency),
      Number(settlement.amount_cents),
    );
  }
  for (const settlement of settlementsReceived) {
    addCurrencyAmount(
      netTotalsByCurrency,
      String(settlement.currency),
      Number(settlement.amount_cents),
    );
  }

  const splitTypeCounts: Record<'equal' | 'custom' | 'percentage', number> = {
    equal: 0,
    custom: 0,
    percentage: 0,
  };
  for (const expense of createdExpenses) {
    const splitType = expense.split_type as 'equal' | 'custom' | 'percentage';
    if (splitType in splitTypeCounts) {
      splitTypeCounts[splitType] += 1;
    }
  }

  const favoriteSplitType = (Object.entries(splitTypeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0) > 0
    ? (Object.entries(splitTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as
      | 'equal'
      | 'custom'
      | 'percentage')
    : null;

  const largestExpenseRow = [...createdExpenses]
    .sort((a, b) => Number(b.total_amount_cents) - Number(a.total_amount_cents))[0];

  return {
    groupsCount,
    ownedGroupsCount,
    createdExpensesCount: createdExpenses.length,
    itemizedExpensesCount: createdExpenses.filter((expense) => expense.is_itemized === true).length,
    settlementsPaidCount: settlementsPaid.length,
    settlementsReceivedCount: settlementsReceived.length,
    ocrScansCount,
    paidTotalsByCurrency,
    shareTotalsByCurrency: sharesByCurrency,
    netTotalsByCurrency,
    largestExpense: largestExpenseRow
      ? {
        title: String(largestExpenseRow.title),
        amountCents: Number(largestExpenseRow.total_amount_cents),
        currency: String(largestExpenseRow.currency),
        date: String(largestExpenseRow.expense_date),
      }
      : null,
    favoriteSplitType,
  };
}

function profileLabel(profile: {
  full_name: string | null;
  username: string | null;
  email: string;
}) {
  return profile.full_name?.trim() || profile.username?.trim() || profile.email;
}

export async function getGlobalAdminStats(): Promise<{ stats: GlobalAdminStats | null; error: string | null }> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return {
      stats: null,
      error: error instanceof Error ? error.message : 'Could not initialize admin stats client.',
    };
  }

  const [profilesResult, groupsResult, expensesResult, settlementsResult, pendingFriendRequestsResult, ocrRequestsResult] =
    await Promise.all([
      admin.from('profiles').select('id, email, full_name, username, is_dummy'),
      admin.from('groups').select('id, name'),
      admin.from('expenses').select('id, group_id, created_by, total_amount_cents, currency, is_itemized'),
      admin.from('settlements').select('id, amount_cents, currency'),
      admin
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      admin
        .from('receipt_ocr_requests')
        .select('id', { count: 'exact', head: true }),
    ]);

  if (profilesResult.error) {
    return { stats: null, error: `Could not load profiles stats: ${profilesResult.error.message}` };
  }
  if (groupsResult.error) {
    return { stats: null, error: `Could not load groups stats: ${groupsResult.error.message}` };
  }
  if (expensesResult.error) {
    return { stats: null, error: `Could not load expenses stats: ${expensesResult.error.message}` };
  }
  if (settlementsResult.error) {
    return { stats: null, error: `Could not load settlements stats: ${settlementsResult.error.message}` };
  }
  if (pendingFriendRequestsResult.error) {
    return {
      stats: null,
      error: `Could not load friend request stats: ${pendingFriendRequestsResult.error.message}`,
    };
  }
  if (ocrRequestsResult.error) {
    return { stats: null, error: `Could not load OCR stats: ${ocrRequestsResult.error.message}` };
  }

  let memberships: Array<{
    group_id: string;
    user_id: string;
    role: 'owner' | 'member';
    accepted_at: string | null;
    left_at?: string | null;
  }> = [];
  try {
    memberships = await getAllGroupMembershipRowsForAdmin(admin);
  } catch (error) {
    return {
      stats: null,
      error: error instanceof Error ? error.message : 'Could not load membership stats.',
    };
  }

  const profiles = profilesResult.data ?? [];
  const groups = groupsResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const settlements = settlementsResult.data ?? [];
  const pendingFriendRequestsCount = pendingFriendRequestsResult.count ?? 0;
  const ocrScansCount = ocrRequestsResult.count ?? 0;

  const activeMembershipsCount = memberships.filter((membership) => membership.left_at == null).length;
  const pendingInvitesCount = memberships.filter(
    (membership) => membership.accepted_at === null && membership.left_at == null,
  ).length;

  const profileById = new Map(
    profiles.map((profile) => [String(profile.id), {
      full_name: profile.full_name,
      username: profile.username,
      email: profile.email,
      is_dummy: profile.is_dummy === true,
    }]),
  );
  const groupNameById = new Map(groups.map((group) => [String(group.id), String(group.name)]));

  const expenseTotalsByCurrency: CurrencyTotals = {};
  const settlementTotalsByCurrency: CurrencyTotals = {};
  const spenderByUser = new Map<string, { expensesCount: number; totalsByCurrency: CurrencyTotals }>();
  const groupActivity = new Map<string, { expensesCount: number; totalsByCurrency: CurrencyTotals }>();

  let largestExpense: GlobalAdminStats['largestExpense'] = null;

  for (const expense of expenses) {
    const amountCents = Number(expense.total_amount_cents);
    const currency = String(expense.currency);
    addCurrencyAmount(expenseTotalsByCurrency, currency, amountCents);

    const spender = spenderByUser.get(String(expense.created_by)) ?? {
      expensesCount: 0,
      totalsByCurrency: {},
    };
    spender.expensesCount += 1;
    addCurrencyAmount(spender.totalsByCurrency, currency, amountCents);
    spenderByUser.set(String(expense.created_by), spender);

    const groupStat = groupActivity.get(String(expense.group_id)) ?? {
      expensesCount: 0,
      totalsByCurrency: {},
    };
    groupStat.expensesCount += 1;
    addCurrencyAmount(groupStat.totalsByCurrency, currency, amountCents);
    groupActivity.set(String(expense.group_id), groupStat);

    if (!largestExpense || amountCents > largestExpense.amountCents) {
      largestExpense = {
        amountCents,
        currency,
        groupName: groupNameById.get(String(expense.group_id)) ?? 'Unknown group',
      };
    }
  }

  for (const settlement of settlements) {
    addCurrencyAmount(
      settlementTotalsByCurrency,
      String(settlement.currency),
      Number(settlement.amount_cents),
    );
  }

  const topSpenders = [...spenderByUser.entries()]
    .map(([userId, data]) => ({
      userId,
      label: profileLabel(profileById.get(userId) ?? {
        full_name: null,
        username: null,
        email: 'Unknown user',
      }),
      expensesCount: data.expensesCount,
      totalsByCurrency: data.totalsByCurrency,
    }))
    .sort((a, b) => b.expensesCount - a.expensesCount)
    .slice(0, 5);

  const busiestGroups = [...groupActivity.entries()]
    .map(([groupId, data]) => ({
      groupId,
      label: groupNameById.get(groupId) ?? 'Unknown group',
      expensesCount: data.expensesCount,
      totalsByCurrency: data.totalsByCurrency,
    }))
    .sort((a, b) => b.expensesCount - a.expensesCount)
    .slice(0, 5);

  return {
    error: null,
    stats: {
      usersCount: profiles.length,
      dummyUsersCount: profiles.filter((profile) => profile.is_dummy === true).length,
      groupsCount: groups.length,
      activeMembershipsCount,
      expensesCount: expenses.length,
      itemizedExpensesCount: expenses.filter((expense) => expense.is_itemized === true).length,
      settlementsCount: settlements.length,
      pendingInvitesCount,
      pendingFriendRequestsCount,
      ocrScansCount,
      expenseTotalsByCurrency,
      settlementTotalsByCurrency,
      largestExpense,
      topSpenders,
      busiestGroups,
    },
  };
}
