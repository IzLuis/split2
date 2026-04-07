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
import {
  deleteExpenseAction,
  type DeleteExpenseActionState,
  type EditExpenseFormState,
} from './actions';
import type { ExpenseEvent, GroupMember, SplitType } from '@/lib/types';

function MemberRow({
  member,
  splitType,
  values,
  locale,
}: {
  member: GroupMember;
  splitType: SplitType;
  values: EditExpenseFormState['values'];
  locale: Locale;
}) {
  const participantState = values.participants[member.user_id];

  return (
    <div className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-4">
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input
          type="checkbox"
          name={`participant_${member.user_id}_included`}
          defaultChecked={participantState?.included ?? false}
        />
        {member.profiles?.full_name || member.profiles?.email || tx(locale, 'Unknown', 'Desconocido')}
      </label>
      <input
        name={`participant_${member.user_id}_amount`}
        defaultValue={participantState?.amount ?? ''}
        type="number"
        min="0"
        step="0.01"
        placeholder={tx(locale, 'Custom amount', 'Monto personalizado')}
        disabled={splitType !== 'custom'}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
      />
      <input
        name={`participant_${member.user_id}_percentage`}
        defaultValue={participantState?.percentage ?? ''}
        type="number"
        min="0"
        step="0.001"
        placeholder={tx(locale, '%', '%')}
        disabled={splitType !== 'percentage'}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
      />
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

export function EditExpenseForm({
  groupId,
  expenseId,
  updateAction,
  initialState,
  members,
  availableEvents,
  locale,
}: {
  groupId: string;
  expenseId: string;
  updateAction: (state: EditExpenseFormState, formData: FormData) => Promise<EditExpenseFormState>;
  initialState: EditExpenseFormState;
  members: GroupMember[];
  availableEvents: ExpenseEvent[];
  locale: Locale;
}) {
  const [state, formAction] = useActionState(updateAction, initialState);
  useActionToast(state);
  const formRef = useRef<HTMLFormElement>(null);
  const [splitType, setSplitType] = useState<SplitType>(initialState.values.splitType);
  const [isItemized, setIsItemized] = useState(initialState.values.isItemized);
  const [itemizedEqualSplit, setItemizedEqualSplit] = useState(initialState.values.itemizedEqualSplit);
  const [itemizedEqualParticipantIds, setItemizedEqualParticipantIds] = useState<string[]>(
    initialState.values.itemizedEqualParticipantIds.length > 0
      ? initialState.values.itemizedEqualParticipantIds
      : members.map((member) => member.user_id),
  );
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [itemRowCount, setItemRowCount] = useState(Math.max(initialState.values.items.length, 1));
  const pendingReceiptRef = useRef<ReceiptOcrResult | null>(null);
  const [prefillCycle, setPrefillCycle] = useState(0);
  const showCreateEvent = isCreatingEvent || state.values.newEventName.trim().length > 0;
  const deleteAction = useMemo(() => deleteExpenseAction.bind(null, groupId, expenseId), [groupId, expenseId]);
  const deleteInitialState: DeleteExpenseActionState = useMemo(
    () => ({
      success: false,
      message: '',
      timestamp: 0,
      values: {},
    }),
    [],
  );
  const [deleteState, deleteFormAction] = useActionState(deleteAction, deleteInitialState);
  useActionToast(deleteState);

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
        backHref={`/app/groups/${groupId}/expenses/${expenseId}`}
        backLabel={tx(locale, 'Back to expense', 'Volver al gasto')}
        title={tx(locale, 'Edit expense', 'Editar gasto')}
      />

      <form
        ref={formRef}
        action={formAction}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <input type="hidden" name="locale" value={locale} />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Title', 'Título')}</span>
          <input name="title" required defaultValue={state.values.title} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Description', 'Descripción')}</span>
          <input name="description" defaultValue={state.values.description} className="w-full rounded-md border border-slate-300 px-3 py-2" />
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
                const label =
                  member.profiles?.full_name
                  || member.profiles?.email
                  || tx(locale, 'Unknown', 'Desconocido');
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
              name="amount"
              required={!isItemized}
              disabled={isItemized}
              defaultValue={state.values.amount}
              type="number"
              min="0.01"
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            />
            {isItemized ? (
              <p className="text-xs text-slate-500">
                {tx(
                  locale,
                  'For itemized expenses, subtotal is calculated from line items.',
                  'Para gastos itemizados, el subtotal se calcula a partir de los artículos.',
                )}
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Tip %', 'Propina %')}</span>
            <input
              name="tipPercentage"
              defaultValue={state.values.tipPercentage}
              type="number"
              min="0"
              step="0.001"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Delivery fee', 'Cargo de envío')}</span>
            <input
              name="deliveryFee"
              defaultValue={state.values.deliveryFee}
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Currency', 'Moneda')}</span>
            <input name="currency" required defaultValue={state.values.currency} maxLength={3} className="w-full rounded-md border border-slate-300 px-3 py-2 uppercase" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Date', 'Fecha')}</span>
            <input name="expenseDate" required defaultValue={state.values.expenseDate} type="date" className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Paid by', 'Pagado por')}</span>
          <select name="paidBy" required defaultValue={state.values.paidBy} className="w-full rounded-md border border-slate-300 px-3 py-2">
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.profiles?.full_name || member.profiles?.email || tx(locale, 'Unknown', 'Desconocido')}
              </option>
            ))}
          </select>
        </label>

        {isItemized ? (
          <section className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">{tx(locale, 'Receipt line items', 'Artículos del ticket')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setItemRowCount((count) => count + 1)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  {tx(locale, 'Add item', 'Agregar artículo')}
                </button>
                {itemRowCount > 1 ? (
                  <button
                    type="button"
                    onClick={() => setItemRowCount((count) => Math.max(1, count - 1))}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {tx(locale, 'Remove last', 'Quitar último')}
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
                        placeholder={tx(locale, 'Item name', 'Nombre del artículo')}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name={`item_${index}_unitPrice`}
                        defaultValue={item.unitPrice}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder={tx(locale, 'Unit price', 'Precio unitario')}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        name={`item_${index}_quantity`}
                        defaultValue={item.quantity}
                        type="number"
                        min="1"
                        step="1"
                        placeholder={tx(locale, 'Quantity', 'Cantidad')}
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
                        {tx(locale, 'Shared item', 'Artículo compartido')}
                      </label>
                      <input
                        name={`item_${index}_notes`}
                        defaultValue={item.notes}
                        placeholder={tx(locale, 'Notes (optional)', 'Notas (opcional)')}
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
                        <p className="text-xs font-medium text-slate-600">{tx(locale, 'Pre-assign users (optional)', 'Preasignar usuarios (opcional)')}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {members.map((member) => {
                            const label =
                              member.profiles?.full_name
                              || member.profiles?.email
                              || tx(locale, 'Unknown', 'Desconocido');
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
                          {tx(
                            locale,
                            'Non-shared items allow one assignee. Shared items split equally across selected assignees.',
                            'Los artículos no compartidos permiten un solo asignado. Los compartidos se dividen en partes iguales entre los asignados.',
                          )}
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
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="equal">{tx(locale, 'Equal', 'Igual')}</option>
                <option value="custom">{tx(locale, 'Custom amounts', 'Montos personalizados')}</option>
                <option value="percentage">{tx(locale, 'Percentages', 'Porcentajes')}</option>
              </select>
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">{tx(locale, 'Participants', 'Participantes')}</p>
              {members.map((member) => (
                <MemberRow key={member.user_id} member={member} splitType={splitType} values={state.values} locale={locale} />
              ))}
            </div>
          </>
        )}

        {!state.success && state.message ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.message}
          </p>
        ) : null}

        <FormSubmit pendingText={tx(locale, 'Saving expense...', 'Guardando gasto...')}>
          {tx(locale, 'Save changes', 'Guardar cambios')}
        </FormSubmit>
      </form>

      <form
        action={deleteFormAction}
        onSubmit={(event) => {
          if (!window.confirm(tx(locale, 'Delete this expense permanently?', '¿Eliminar este gasto permanentemente?'))) {
            event.preventDefault();
          }
        }}
        className="rounded-xl border border-rose-200 bg-rose-50 p-5"
      >
        <input type="hidden" name="locale" value={locale} />
        <h2 className="text-sm font-semibold text-rose-700">{tx(locale, 'Danger zone', 'Zona de peligro')}</h2>
        <button type="submit" className="mt-3 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700">
          {tx(locale, 'Delete expense', 'Eliminar gasto')}
        </button>
      </form>
    </div>
  );
}
