'use client';

import { useActionState } from 'react';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import type { ProfileFormState } from './actions';
import { updateProfileAction } from './actions';

export function ProfileForm({
  initialState,
  email,
}: {
  initialState: ProfileFormState;
  email: string;
}) {
  const [state, action] = useActionState(updateProfileAction, initialState);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref="/app"
        backLabel="Back to dashboard"
        title="Your profile"
      />

      <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            value={email}
            disabled
            className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-slate-600"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            name="fullName"
            required
            defaultValue={state.values.fullName}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Username</span>
          <input
            name="username"
            defaultValue={state.values.username}
            placeholder="example_user"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <p className="text-xs text-slate-500">
            3-30 chars, lowercase letters, numbers, underscores.
          </p>
        </label>

        {state.error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}

        <FormSubmit pendingText="Saving profile...">Save profile</FormSubmit>
      </form>
    </div>
  );
}
