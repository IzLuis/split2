'use client';

import { useActionState } from 'react';
import { useActionToast } from '@/components/action-toast';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import type { FriendProfile } from '@/lib/friends';
import { deleteGroupAction, type EditGroupFormState } from './actions';

export function EditGroupForm({
  groupId,
  updateAction,
  initialState,
  availableProfiles,
}: {
  groupId: string;
  updateAction: (state: EditGroupFormState, formData: FormData) => Promise<EditGroupFormState>;
  initialState: EditGroupFormState;
  availableProfiles: FriendProfile[];
}) {
  const [state, formAction] = useActionState(updateAction, initialState);
  useActionToast(state);
  const deleteAction = deleteGroupAction.bind(null, groupId);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        backHref={`/app/groups/${groupId}`}
        backLabel="Back to group"
        title="Edit group"
      />

      <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Group name</span>
          <input
            required
            name="name"
            defaultValue={state.values.name}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <textarea
            name="description"
            defaultValue={state.values.description}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Default currency</span>
            <select name="defaultCurrency" defaultValue={state.values.defaultCurrency} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Calculation mode</span>
            <select name="calculationMode" defaultValue={state.values.calculationMode} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="normal">Normal</option>
              <option value="reduced">Reduced transfers</option>
            </select>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Members (friends + current)</legend>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
            {availableProfiles.length === 0 ? (
              <p className="text-sm text-slate-500">No members available.</p>
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
          <span className="text-sm font-medium text-slate-700">Invite by email (optional)</span>
          <textarea
            name="inviteEmails"
            defaultValue={state.values.inviteEmails}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="friend1@email.com, friend2@email.com"
          />
          <p className="text-xs text-slate-500">
            If the email is not registered yet, a Supabase invite email is sent and the member is marked as pending.
          </p>
        </label>

        {!state.success && state.message ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.message}
          </p>
        ) : null}

        <FormSubmit pendingText="Saving group...">Save changes</FormSubmit>
      </form>

      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm('Delete this group permanently? This will remove expenses and settlements.')) {
            event.preventDefault();
          }
        }}
        className="rounded-xl border border-rose-200 bg-rose-50 p-5"
      >
        <h2 className="text-sm font-semibold text-rose-700">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-600">This cannot be undone.</p>
        <button
          type="submit"
          className="mt-3 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Delete group
        </button>
      </form>
    </div>
  );
}
