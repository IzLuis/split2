'use client';

import { useActionState, useMemo } from 'react';
import { useActionToast } from '@/components/action-toast';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import { tx, type Locale } from '@/lib/i18n/shared';
import type { GroupMember } from '@/lib/types';
import { formatCurrency, formatMemberLabel } from '@/lib/utils';
import { createSettlementAction, type CreateSettlementFormState } from './actions';

const initialState: CreateSettlementFormState = {
  success: false,
  message: '',
  timestamp: 0,
  values: {
    amount: '',
    currency: 'MXN',
    settledOn: '',
    payerId: '',
    receiverId: '',
    note: '',
  },
};

export function NewSettlementForm({
  groupId,
  members,
  locale,
  currentUserId,
  defaultCurrency,
  suggestedReceiverId,
  suggestedAmountCents,
  debtReminders,
}: {
  groupId: string;
  members: GroupMember[];
  locale: Locale;
  currentUserId: string;
  defaultCurrency: 'USD' | 'MXN';
  suggestedReceiverId: string;
  suggestedAmountCents: number | null;
  debtReminders: Array<{
    receiverUserId: string;
    amountCents: number;
  }>;
}) {
  const [state, action] = useActionState(createSettlementAction, initialState);
  useActionToast(state);
  const today = useMemo(
    () => state.values.settledOn || new Date().toISOString().slice(0, 10),
    [state.values.settledOn],
  );
  const defaultPayerId = state.values.payerId || currentUserId;
  const defaultReceiverId = state.values.receiverId || suggestedReceiverId;
  const defaultAmountValue = state.values.amount || (
    suggestedAmountCents && suggestedAmountCents > 0
      ? (suggestedAmountCents / 100).toFixed(2)
      : ''
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref={`/app/groups/${groupId}`}
        backLabel={tx(locale, 'Back to group', 'Volver al grupo')}
        title={tx(locale, 'Record settlement', 'Registrar pago')}
      />

      <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="locale" value={locale} />

        <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-sm font-medium text-slate-700">
            {tx(locale, 'Your current debts', 'Tus deudas actuales')}
          </p>
          {debtReminders.length === 0 ? (
            <p className="text-sm text-slate-600">
              {tx(
                locale,
                'You do not currently owe anyone in this group.',
                'Actualmente no le debes a nadie en este grupo.',
              )}
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {debtReminders.map((debt) => {
                const receiver = members.find((member) => member.user_id === debt.receiverUserId);
                return (
                  <li key={debt.receiverUserId}>
                    {tx(locale, 'You owe', 'Debes a')}{' '}
                    <span className="font-medium">{formatMemberLabel(receiver?.profiles ?? null, locale)}</span>{' '}
                    <span className="font-medium">{formatCurrency(debt.amountCents, defaultCurrency)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Amount', 'Monto')}</span>
            <input
              required
              name="amount"
              defaultValue={defaultAmountValue}
              type="number"
              min="0.01"
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Currency', 'Moneda')}</span>
            <select
              name="currency"
              defaultValue={state.values.currency || defaultCurrency}
              className="w-full rounded-md border border-slate-300 px-3 py-2 uppercase outline-none ring-slate-300 focus:ring"
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Date', 'Fecha')}</span>
            <input
              required
              name="settledOn"
              type="date"
              defaultValue={today}
              lang="es-MX"
              title="DD/MM/YYYY"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Who paid', 'Quién pagó')}</span>
            <select
              required
              name="payerId"
              defaultValue={defaultPayerId}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            >
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {formatMemberLabel(member.profiles, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Who received', 'Quién recibió')}</span>
            <select
              required
              name="receiverId"
              defaultValue={defaultReceiverId}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            >
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {formatMemberLabel(member.profiles, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Note (optional)', 'Nota (opcional)')}</span>
          <input
            name="note"
            defaultValue={state.values.note}
            placeholder={tx(locale, 'Cash transfer', 'Transferencia')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </label>

        {!state.success && state.message ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.message}
          </p>
        ) : null}

        <FormSubmit pendingText={tx(locale, 'Saving settlement...', 'Guardando pago...')}>
          {tx(locale, 'Save settlement', 'Guardar pago')}
        </FormSubmit>
      </form>
    </div>
  );
}
