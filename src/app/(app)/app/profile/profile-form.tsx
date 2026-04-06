'use client';

import { useActionState } from 'react';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import { tx, type Locale } from '@/lib/i18n/shared';
import type { ProfileFormState } from './actions';
import { updateProfileAction } from './actions';

function translateProfileStateMessage(locale: Locale, message: string) {
  if (locale !== 'es') return message;

  if (message === 'Name is required.') return 'El nombre es obligatorio.';
  if (message === 'That username is already taken.') return 'Ese nombre de usuario ya está en uso.';
  if (message === 'Profile updated.') return 'Perfil actualizado.';
  if (message === 'Could not update profile: new row violates row-level security policy for table "profiles"') {
    return 'No se pudo actualizar el perfil: no estás autorizado para hacer esto.';
  }
  if (
    message ===
    'Username must be 3-30 characters and use only lowercase letters, numbers, or underscores.'
  ) {
    return 'El nombre de usuario debe tener 3-30 caracteres y usar solo letras minúsculas, números o guiones bajos.';
  }
  if (message.startsWith('Could not update profile:')) {
    return message.replace('Could not update profile:', 'No se pudo actualizar el perfil:');
  }

  return message;
}

export function ProfileForm({
  initialState,
  email,
  locale,
}: {
  initialState: ProfileFormState;
  email: string;
  locale: Locale;
}) {
  const [state, action] = useActionState(updateProfileAction, initialState);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref="/app"
        backLabel={tx(locale, 'Back to dashboard', 'Volver al panel')}
        title={tx(locale, 'Your profile', 'Tu perfil')}
      />

      <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Email', 'Correo')}</span>
          <input
            value={email}
            disabled
            className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-slate-600"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Name', 'Nombre')}</span>
          <input
            name="fullName"
            required
            defaultValue={state.values.fullName}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">{tx(locale, 'Username', 'Nombre de usuario')}</span>
          <input
            name="username"
            defaultValue={state.values.username}
            placeholder="example_user"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <p className="text-xs text-slate-500">
            {tx(locale, '3-30 chars, lowercase letters, numbers, underscores.', '3-30 caracteres, letras minúsculas, números y guiones bajos.')}
          </p>
        </label>

        {state.error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {translateProfileStateMessage(locale, state.error)}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {translateProfileStateMessage(locale, state.success)}
          </p>
        ) : null}

        <FormSubmit pendingText={tx(locale, 'Saving profile...', 'Guardando perfil...')}>
          {tx(locale, 'Save profile', 'Guardar perfil')}
        </FormSubmit>
      </form>
    </div>
  );
}
