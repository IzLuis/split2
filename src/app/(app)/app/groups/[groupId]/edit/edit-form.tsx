'use client';

import { useActionState } from 'react';
import { useActionToast } from '@/components/action-toast';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import type { FriendProfile } from '@/lib/friends';
import { tx, type Locale } from '@/lib/i18n/shared';
import { deleteGroupAction, type EditGroupFormState } from './actions';

export function EditGroupForm({
  groupId,
  updateAction,
  initialState,
  availableProfiles,
  locale,
}: {
  groupId: string;
  updateAction: (state: EditGroupFormState, formData: FormData) => Promise<EditGroupFormState>;
  initialState: EditGroupFormState;
  availableProfiles: FriendProfile[];
  locale: Locale;
}) {
  const [state, formAction] = useActionState(updateAction, initialState);
  useActionToast(state);
  const deleteAction = deleteGroupAction.bind(null, groupId);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref={`/app/groups/${groupId}`}
        backLabel={tx(locale, 'Back to group', 'Volver al grupo')}
        title={tx(locale, 'Edit group', 'Editar grupo')}
      />

      <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Group name', 'Nombre del grupo')}</span>
          <input
            required
            name="name"
            defaultValue={state.values.name}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Description', 'Descripción')}</span>
          <textarea
            name="description"
            defaultValue={state.values.description}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Default currency', 'Moneda predeterminada')}</span>
            <select name="defaultCurrency" defaultValue={state.values.defaultCurrency} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Calculation mode', 'Modo de cálculo')}</span>
            <select name="calculationMode" defaultValue={state.values.calculationMode} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="normal">{tx(locale, 'Normal', 'Normal')}</option>
              <option value="reduced">{tx(locale, 'Reduced transfers', 'Transferencias reducidas')}</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{tx(locale, 'Members (friends + current)', 'Miembros (amigos + actuales)')}</legend>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
            {availableProfiles.length === 0 ? (
              <p className="text-sm text-slate-500">{tx(locale, 'No members available.', 'No hay miembros disponibles.')}</p>
            ) : (
              availableProfiles.map((profile) => {
                const label = profile.full_name?.trim() || profile.username?.trim() || profile.email;
                return (
                  <label key={profile.email} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="memberEmails"
                      value={profile.email}
                      defaultChecked={state.values.memberEmails.includes(profile.email.toLowerCase())}
                    />
                    {label}
                  </label>
                );
              })
            )}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Invite by email (optional)', 'Invitar por correo (opcional)')}</span>
          <textarea
            name="inviteEmails"
            defaultValue={state.values.inviteEmails}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder={tx(locale, 'friend1@email.com, friend2@email.com', 'amigo1@email.com, amigo2@email.com')}
          />
          <p className="text-xs text-slate-500">
            {tx(
              locale,
              'If the email is not registered yet, a Supabase invite email is sent and the member is marked as pending.',
              'Si el correo aún no está registrado, se envía una invitación de Supabase y el miembro se marca como pendiente.',
            )}
          </p>
        </label>

        {!state.success && state.message ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.message}
          </p>
        ) : null}

        <FormSubmit pendingText={tx(locale, 'Saving group...', 'Guardando grupo...')}>
          {tx(locale, 'Save changes', 'Guardar cambios')}
        </FormSubmit>
      </form>

      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              tx(
                locale,
                'Delete this group permanently? This will remove expenses and settlements.',
                '¿Eliminar este grupo permanentemente? Esto eliminará gastos y pagos.',
              ),
            )
          ) {
            event.preventDefault();
          }
        }}
        className="rounded-xl border border-rose-200 bg-rose-50 p-5"
      >
        <h2 className="text-sm font-semibold text-rose-700">{tx(locale, 'Danger zone', 'Zona de peligro')}</h2>
        <p className="mt-1 text-xs text-rose-600">{tx(locale, 'This cannot be undone.', 'Esto no se puede deshacer.')}</p>
        <button
          type="submit"
          className="mt-3 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          {tx(locale, 'Delete group', 'Eliminar grupo')}
        </button>
      </form>
    </div>
  );
}
