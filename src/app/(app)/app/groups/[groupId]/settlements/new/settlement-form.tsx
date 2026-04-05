'use client';

import { useActionState, useMemo } from 'react';
import { useActionToast } from '@/components/action-toast';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import type { GroupMember } from '@/lib/types';
import { createSettlementAction, type CreateSettlementFormState } from './actions';

const initialState: CreateSettlementFormState = {
  success: false,
  message: '',
  timestamp: 0,
  values: {
    amount: '',
    currency: 'USD',
    settledOn: '',
    payerId: '',
    receiverId: '',
    note: '',
  },
};

export function NewSettlementForm({
  groupId,
  members,
}: {
  groupId: string;
  members: GroupMember[];
}) {
  const [state, action] = useActionState(createSettlementAction, initialState);
  useActionToast(state);
  const today = useMemo(
    () => state.values.settledOn || new Date().toISOString().slice(0, 10),
    [state.values.settledOn],
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref={`/app/groups/${groupId}`}
        backLabel="Back to group"
        title="Record settlement"
      />

      <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <input type="hidden" name="groupId" value={groupId} />

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Amount</span>
            <input
              required
              name="amount"
              defaultValue={state.values.amount}
              type="number"
              min="0.01"
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Currency</span>
            <input
              required
              name="currency"
              defaultValue={state.values.currency || 'USD'}
              maxLength={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 uppercase outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Date</span>
            <input
              required
              name="settledOn"
              type="date"
              defaultValue={today}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Who paid</span>
            <select
              required
              name="payerId"
              defaultValue={state.values.payerId}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            >
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.profiles?.full_name || member.profiles?.email || 'Unknown'}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Who received</span>
            <select
              required
              name="receiverId"
              defaultValue={state.values.receiverId}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            >
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.profiles?.full_name || member.profiles?.email || 'Unknown'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Note (optional)</span>
          <input
            name="note"
            defaultValue={state.values.note}
            placeholder="Cash transfer"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </label>

        {!state.success && state.message ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.message}
          </p>
        ) : null}

        <FormSubmit pendingText="Saving settlement...">Save settlement</FormSubmit>
      </form>
    </div>
  );
}
