'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useActionToast } from '@/components/action-toast';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import type { FriendProfile } from '@/lib/friends';
import { tx, type Locale } from '@/lib/i18n/shared';
import { createGroupAction, type CreateGroupFormState } from './actions';

const initialState: CreateGroupFormState = {
  success: false,
  message: '',
  timestamp: 0,
  values: {
    name: '',
    description: '',
    defaultCurrency: 'USD',
    calculationMode: 'normal',
    memberEmails: [],
    inviteEmails: '',
  },
};

export function NewGroupForm({
  availableProfiles,
  locale,
}: {
  availableProfiles: FriendProfile[];
  locale: Locale;
}) {
  const [state, action] = useActionState(createGroupAction, initialState);
  useActionToast(state);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref="/app"
        backLabel={tx(locale, 'Back to dashboard', 'Volver al panel')}
        title={tx(locale, 'Create group', 'Crear grupo')}
        description={tx(locale, 'Create your group and select who is part of it.', 'Crea tu grupo y selecciona quién forma parte de él.')}
      />

      <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Group name', 'Nombre del grupo')}</span>
          <input
            required
            name="name"
            defaultValue={state.values.name}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder={tx(locale, 'Cancun Trip', 'Viaje a Cancún')}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Description (optional)', 'Descripción (opcional)')}</span>
          <textarea
            name="description"
            defaultValue={state.values.description}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder={tx(locale, 'Spring break expenses', 'Gastos de vacaciones')}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Default currency', 'Moneda predeterminada')}</span>
            <select
              name="defaultCurrency"
              defaultValue={state.values.defaultCurrency}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Calculation mode', 'Modo de cálculo')}</span>
            <select
              name="calculationMode"
              defaultValue={state.values.calculationMode}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="normal">{tx(locale, 'Normal', 'Normal')}</option>
              <option value="reduced">{tx(locale, 'Reduced transfers', 'Transferencias reducidas')}</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{tx(locale, 'Invite friends', 'Invitar amigos')}</legend>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
            {availableProfiles.length === 0 ? (
              <p className="text-sm text-slate-500">
                {tx(locale, 'No friends yet. Add friends from the', 'Aún no tienes amigos. Agrégalos desde')}{' '}
                <Link href="/app/friends" className="underline">
                  {tx(locale, 'Friends page', 'la página de Amigos')}
                </Link>{' '}
                {tx(locale, 'first.', 'primero.')}
              </p>
            ) : (
              availableProfiles.map((profile) => {
                const checked = state.values.memberEmails.includes(profile.email.toLowerCase());
                const label = profile.full_name?.trim() || profile.username?.trim() || profile.email;
                return (
                  <label key={profile.email} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="memberEmails"
                      value={profile.email}
                      defaultChecked={checked}
                    />
                    {label}
                  </label>
                );
              })
            )}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">
            {tx(locale, 'Invite by email (optional)', 'Invitar por correo (opcional)')}
          </span>
          <textarea
            name="inviteEmails"
            defaultValue={state.values.inviteEmails}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            placeholder={tx(
              locale,
              'friend1@email.com, friend2@email.com',
              'amigo1@email.com, amigo2@email.com',
            )}
          />
          <p className="text-xs text-slate-500">
            {tx(
              locale,
              'If an email does not have an account yet, we will send an invite and mark that member as pending.',
              'Si un correo aún no tiene cuenta, enviaremos una invitación y el miembro quedará como pendiente.',
            )}
          </p>
        </label>

        {!state.success && state.message ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.message}
          </p>
        ) : null}

        <FormSubmit pendingText={tx(locale, 'Creating group...', 'Creando grupo...')}>
          {tx(locale, 'Create group', 'Crear grupo')}
        </FormSubmit>
      </form>
    </div>
  );
}
