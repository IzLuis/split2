'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useActionToast } from '@/components/action-toast';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import { ReceiptOcrUploader } from '@/components/receipt-ocr-uploader';
import { DEFAULT_EXPENSE_EVENT_COLOR } from '@/lib/expense-events';
import { tx, type Locale } from '@/lib/i18n/shared';
import { emptyItemizedFormItem } from '@/lib/itemized-expenses';
import {
  resolveReceiptSubtotal,
  resolveReceiptTipPercentage,
  toMoneyInputString,
  toPercentString,
  type ReceiptOcrResult,
} from '@/lib/receipt-ocr';
import type { ExpenseEvent, GroupMember, SplitType } from '@/lib/types';
import {
  createExpenseAction,
  type CreateExpenseActionState,
  type CreateExpenseFormState,
} from './actions';

const initialState: CreateExpenseActionState = {
  success: false,
  message: '',
  timestamp: 0,
  values: {
    title: '',
    description: '',
    amount: '',
    tipPercentage: '',
    deliveryFee: '',
    currency: '',
    eventId: '',
    newEventName: '',
    newEventColor: DEFAULT_EXPENSE_EVENT_COLOR,
    expenseDate: '',
    paidBy: '',
    splitType: 'equal',
    isItemized: false,
    itemizedEqualSplit: false,
    itemizedEqualParticipantIds: [],
    items: [emptyItemizedFormItem()],
    participants: {},
  },
};

function MemberRow({
  member,
  splitType,
  values,
  locale,
}: {
  member: GroupMember;
  splitType: SplitType;
  values: CreateExpenseFormState;
  locale: Locale;
}) {
  const participantState = values.participants[member.user_id];
  const showAmount = splitType === 'custom';
  const showPercentage = splitType === 'percentage';

  return (
    <div className={`grid gap-2 rounded-md border border-slate-200 p-3 ${showAmount || showPercentage ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
      <label className={`flex items-center gap-2 text-sm text-slate-700 ${showAmount || showPercentage ? 'sm:col-span-2' : ''}`}>
        <input
          type="checkbox"
          name={`participant_${member.user_id}_included`}
          defaultChecked={participantState?.included ?? true}
        />
        {member.profiles?.full_name || member.profiles?.email || tx(locale, 'Unknown', 'Desconocido')}
      </label>
      {showAmount ? (
        <input
          name={`participant_${member.user_id}_amount`}
          defaultValue={participantState?.amount ?? ''}
          type="number"
          min="0"
          step="0.01"
          placeholder={tx(locale, 'Custom amount', 'Monto personalizado')}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      ) : null}
      {showPercentage ? (
        <input
          name={`participant_${member.user_id}_percentage`}
          defaultValue={participantState?.percentage ?? ''}
          type="number"
          min="0"
          step="0.001"
          placeholder={tx(locale, 'Percentage', 'Porcentaje')}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      ) : null}
    </div>
  );
}

function setFormFieldValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (!field) {
    return;
  }

  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    field.value = value;
  }
}

function setFormCheckboxValue(form: HTMLFormElement, name: string, checked: boolean) {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) {
    return;
  }

  field.checked = checked;
}

export function NewExpenseForm({
  groupId,
  members,
  defaultCurrency,
  availableEvents,
  locale,
}: {
  groupId: string;
  members: GroupMember[];
  defaultCurrency: 'USD' | 'MXN';
  availableEvents: ExpenseEvent[];
  locale: Locale;
}) {
  const [state, action] = useActionState(createExpenseAction, initialState);
  useActionToast(state);
  const formRef = useRef<HTMLFormElement>(null);
  const [splitType, setSplitType] = useState<SplitType>(state.values.splitType);
  const [isItemized, setIsItemized] = useState(state.values.isItemized);
  const [itemizedEqualSplit, setItemizedEqualSplit] = useState(state.values.itemizedEqualSplit);
  const [itemizedEqualParticipantIds, setItemizedEqualParticipantIds] = useState<string[]>(
    state.values.itemizedEqualParticipantIds.length > 0
      ? state.values.itemizedEqualParticipantIds
      : members.map((member) => member.user_id),
  );
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [itemRowCount, setItemRowCount] = useState(Math.max(state.values.items.length, 1));
  const pendingReceiptRef = useRef<ReceiptOcrResult | null>(null);
  const [prefillCycle, setPrefillCycle] = useState(0);
  const showCreateEvent = isCreatingEvent || state.values.newEventName.trim().length > 0;

  const today = useMemo(
    () => state.values.expenseDate || new Date().toISOString().slice(0, 10),
    [state.values.expenseDate],
  );

  useEffect(() => {
    const pendingReceipt = pendingReceiptRef.current;
    if (!pendingReceipt || !isItemized) {
      return;
    }

    const expectedRows = Math.max(pendingReceipt.items.length, 1);
    if (itemRowCount < expectedRows) {
      return;
    }

    const form = formRef.current;
    if (!form) {
      return;
    }

    setFormFieldValue(form, 'title', pendingReceipt.title);

    const subtotal = resolveReceiptSubtotal(pendingReceipt);
    setFormFieldValue(form, 'amount', toMoneyInputString(subtotal));
    setFormFieldValue(form, 'deliveryFee', toMoneyInputString(pendingReceipt.deliveryFee));
    setFormFieldValue(form, 'tipPercentage', toPercentString(resolveReceiptTipPercentage(pendingReceipt)));

    if (pendingReceipt.currency) {
      setFormFieldValue(form, 'currency', pendingReceipt.currency);
    }
    if (pendingReceipt.expenseDate) {
      setFormFieldValue(form, 'expenseDate', pendingReceipt.expenseDate);
    }

    for (let index = 0; index < itemRowCount; index += 1) {
      const item = pendingReceipt.items[index];
      setFormFieldValue(form, `item_${index}_name`, item?.name ?? '');
      setFormFieldValue(form, `item_${index}_unitPrice`, toMoneyInputString(item?.unitPrice ?? null));
      setFormFieldValue(form, `item_${index}_quantity`, item ? String(item.quantity) : '1');
      setFormFieldValue(form, `item_${index}_notes`, '');
      setFormCheckboxValue(form, `item_${index}_shared`, false);

      const assigneeCheckboxes = form.querySelectorAll<HTMLInputElement>(
        `input[name^="item_${index}_assignee_"]`,
      );
      assigneeCheckboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
    }

    pendingReceiptRef.current = null;
  }, [prefillCycle, isItemized, itemRowCount]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref={`/app/groups/${groupId}`}
        backLabel={tx(locale, 'Back to group', 'Volver al grupo')}
        title={tx(locale, 'Create expense', 'Crear gasto')}
      />

      <form
        ref={formRef}
        action={action}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="locale" value={locale} />

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Title', 'Título')}</span>
          <input
            name="title"
            defaultValue={state.values.title}
            required
            placeholder={tx(locale, 'Dinner', 'Cena')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Description (optional)', 'Descripción (opcional)')}</span>
          <input
            name="description"
            defaultValue={state.values.description}
            placeholder={tx(locale, 'Friday dinner downtown', 'Cena del viernes en el centro')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
          />
        </label>

        <ReceiptOcrUploader
          locale={locale}
          onParsed={(receipt) => {
            setIsItemized(true);
            setItemRowCount(Math.max(receipt.items.length, 1));
            pendingReceiptRef.current = receipt;
            setPrefillCycle((cycle) => cycle + 1);
          }}
        />

        <section className="space-y-2 rounded-md border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Event (optional)', 'Evento (opcional)')}</span>
            <button
              type="button"
              onClick={() => setIsCreatingEvent((value) => !value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              aria-label={tx(locale, 'Create new event', 'Crear nuevo evento')}
              title={tx(locale, 'Create new event', 'Crear nuevo evento')}
            >
              +
            </button>
          </div>

          <select
            name="eventId"
            defaultValue={state.values.eventId}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{tx(locale, 'No event', 'Sin evento')}</option>
            {availableEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>

          {showCreateEvent ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                name="newEventName"
                defaultValue={state.values.newEventName}
                placeholder={tx(locale, 'New event name', 'Nombre del nuevo evento')}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-2 py-2 text-xs text-slate-600">
                {tx(locale, 'Color', 'Color')}
                <input
                  type="color"
                  name="newEventColor"
                  defaultValue={state.values.newEventColor || DEFAULT_EXPENSE_EVENT_COLOR}
                  className="h-7 w-8 cursor-pointer rounded border border-slate-200 p-0"
                />
              </label>
            </div>
          ) : null}

          <p className="text-xs text-slate-500">
            {tx(
              locale,
              'Select an existing event or click + to create one without leaving this form.',
              'Selecciona un evento existente o da clic en + para crear uno sin salir del formulario.',
            )}
          </p>
        </section>

        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input
            name="isItemized"
            type="checkbox"
            checked={isItemized}
            onChange={(event) => setIsItemized(event.target.checked)}
          />
          {tx(locale, 'Enable Itemized Expense', 'Activar gasto itemizado')}
        </label>

        {isItemized ? (
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              name="itemizedEqualSplit"
              type="checkbox"
              checked={itemizedEqualSplit}
              onChange={(event) => {
                const checked = event.target.checked;
                setItemizedEqualSplit(checked);
                if (checked && itemizedEqualParticipantIds.length === 0) {
                  setItemizedEqualParticipantIds(members.map((member) => member.user_id));
                }
              }}
            />
            {tx(
              locale,
              'Split itemized expense equally across all current group members',
              'Dividir gasto itemizado en partes iguales entre todos los miembros actuales del grupo',
            )}
          </label>
        ) : null}

        {isItemized && itemizedEqualSplit ? (
          <section className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">
              {tx(locale, 'Participants for equal split', 'Participantes para división igual')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((member) => {
                const label = member.profiles?.full_name || member.profiles?.email || 'Unknown';
                const checked = itemizedEqualParticipantIds.includes(member.user_id);
                return (
                  <label key={`equal-split-${member.user_id}`} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name={`itemizedEqualParticipant_${member.user_id}`}
                      checked={checked}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setItemizedEqualParticipantIds((current) => {
                          if (enabled) {
                            return [...new Set([...current, member.user_id])];
                          }
                          return current.filter((id) => id !== member.user_id);
                        });
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Subtotal amount', 'Monto subtotal')}</span>
            <input
              required={!isItemized}
              name="amount"
              defaultValue={state.values.amount}
              type="number"
              min="0.01"
              step="0.01"
              disabled={isItemized}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring disabled:bg-slate-100"
            />
            {isItemized ? (
              <p className="text-xs text-slate-500">
                {tx(
                  locale,
                  'For itemized expenses, subtotal is calculated from line items.',
                  'Para gastos itemizados, el subtotal se calcula con los artículos.',
                )}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Tip % (optional)', 'Propina % (opcional)')}</span>
            <input
              name="tipPercentage"
              defaultValue={state.values.tipPercentage}
              type="number"
              min="0"
              step="0.001"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Delivery fee (optional)', 'Cargo de envío (opcional)')}</span>
            <input
              name="deliveryFee"
              defaultValue={state.values.deliveryFee}
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Currency', 'Moneda')}</span>
            <input
              required
              name="currency"
              defaultValue={state.values.currency || defaultCurrency}
              maxLength={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 uppercase outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Date', 'Fecha')}</span>
            <input
              required
              name="expenseDate"
              type="date"
              defaultValue={today}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Paid by', 'Pagado por')}</span>
          <select
            name="paidBy"
            required
            defaultValue={state.values.paidBy}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
          >
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.profiles?.full_name || member.profiles?.email || 'Unknown'}
              </option>
            ))}
          </select>
        </label>

        {isItemized ? (
          <section className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Receipt line items</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setItemRowCount((count) => count + 1)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Add item
                </button>
                {itemRowCount > 1 ? (
                  <button
                    type="button"
                    onClick={() => setItemRowCount((count) => Math.max(1, count - 1))}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Remove last
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              {Array.from({ length: itemRowCount }, (_, index) => {
                const item = state.values.items[index] ?? emptyItemizedFormItem();
                const itemKey = `item-${index}-${item.name}-${item.unitPrice}-${item.quantity}-${item.isShared}-${item.notes}-${item.assigneeUserIds.join(',')}`;

                return (
                  <div key={itemKey} className="space-y-2 rounded-md border border-slate-200 p-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        name={`item_${index}_name`}
                        defaultValue={item.name}
                        placeholder="Item name"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name={`item_${index}_unitPrice`}
                        defaultValue={item.unitPrice}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Unit price"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name={`item_${index}_quantity`}
                        defaultValue={item.quantity}
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Quantity"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          name={`item_${index}_shared`}
                          type="checkbox"
                          defaultChecked={itemizedEqualSplit ? true : item.isShared}
                          disabled={itemizedEqualSplit}
                        />
                        Shared item
                      </label>
                      <input
                        name={`item_${index}_notes`}
                        defaultValue={item.notes}
                        placeholder="Notes (optional)"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    {itemizedEqualSplit ? (
                      <p className="text-xs text-slate-500">
                        {tx(
                          locale,
                          'Equal itemized mode is enabled: this item will be shared by every current group member.',
                          'El modo itemizado igual está activado: este artículo se compartirá entre todos los miembros actuales del grupo.',
                        )}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-600">Pre-assign users (optional)</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {members.map((member) => {
                            const label = member.profiles?.full_name || member.profiles?.email || 'Unknown';
                            const checked = item.assigneeUserIds.includes(member.user_id);
                            return (
                              <label key={`${index}-${member.user_id}`} className="inline-flex items-center gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  name={`item_${index}_assignee_${member.user_id}`}
                                  defaultChecked={checked}
                                />
                                {label}
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-slate-500">
                          Non-shared items allow one assignee. Shared items split equally across selected assignees.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{tx(locale, 'Split type', 'Tipo de división')}</span>
              <select
                name="splitType"
                value={splitType}
                onChange={(event) => setSplitType(event.target.value as SplitType)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
              >
                <option value="equal">{tx(locale, 'Equal', 'Igual')}</option>
                <option value="custom">{tx(locale, 'Custom amounts', 'Montos personalizados')}</option>
                <option value="percentage">{tx(locale, 'Percentages', 'Porcentajes')}</option>
              </select>
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">{tx(locale, 'Participants', 'Participantes')}</p>
              {members.map((member) => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  splitType={splitType}
                  values={state.values}
                  locale={locale}
                />
              ))}
              <p className="text-xs text-slate-500">
                {tx(
                  locale,
                  'For equal split, just choose participants. For custom/percentage, provide values for selected participants.',
                  'Para división igual, solo elige participantes. Para montos personalizados o porcentajes, captura valores para los participantes seleccionados.',
                )}
              </p>
            </div>
          </>
        )}

        {!state.success && state.message ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.message}
          </p>
        ) : null}

        <FormSubmit pendingText={tx(locale, 'Saving expense...', 'Guardando gasto...')}>
          {tx(locale, 'Save expense', 'Guardar gasto')}
        </FormSubmit>
      </form>
    </div>
  );
}
