'use client';

import { useActionState } from 'react';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import type { FriendProfile, FriendRequestWithProfiles } from '@/lib/friends';
import { formatDate } from '@/lib/utils';
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  removeFriendAction,
  sendFriendRequestAction,
  type AddFriendFormState,
} from './actions';

function friendLabel(friend: FriendProfile) {
  return friend.full_name?.trim() || friend.username?.trim() || friend.email;
}

function friendHandle(friend: FriendProfile) {
  return friend.username ? `@${friend.username}` : friend.email;
}

export function FriendsClient({
  initialState,
  incomingRequests,
  outgoingRequests,
  friends,
}: {
  initialState: AddFriendFormState;
  incomingRequests: FriendRequestWithProfiles[];
  outgoingRequests: FriendRequestWithProfiles[];
  friends: FriendProfile[];
}) {
  const [state, action] = useActionState(sendFriendRequestAction, initialState);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        backHref="/app"
        backLabel="Back to dashboard"
        title="Friends"
        description="Add friends by email/username to quickly invite them into new groups."
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Add friend</h2>
        <form action={action} className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Email or username</span>
            <input
              name="identifier"
              placeholder="friend@email.com or username"
              defaultValue={state.values.identifier}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
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

          <FormSubmit pendingText="Sending request...">Send request</FormSubmit>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Incoming requests</h2>
        {incomingRequests.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No incoming requests.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {incomingRequests.map((request) => (
              <li key={request.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{friendLabel(request.requester)}</p>
                <p className="text-xs text-slate-500">{friendHandle(request.requester)}</p>
                <p className="mt-1 text-xs text-slate-500">Requested on {formatDate(request.created_at)}</p>
                <div className="mt-3 flex items-center gap-2">
                  <form action={acceptFriendRequestAction.bind(null, request.id)}>
                    <button
                      type="submit"
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      Accept
                    </button>
                  </form>
                  <form action={declineFriendRequestAction.bind(null, request.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Decline
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Outgoing requests</h2>
        {outgoingRequests.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No pending outgoing requests.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {outgoingRequests.map((request) => (
              <li key={request.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{friendLabel(request.addressee)}</p>
                <p className="text-xs text-slate-500">{friendHandle(request.addressee)}</p>
                <p className="mt-1 text-xs text-slate-500">Requested on {formatDate(request.created_at)}</p>
                <form action={cancelFriendRequestAction.bind(null, request.id)} className="mt-3">
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Cancel request
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Your friends</h2>
        {friends.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No friends yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {friends.map((friend) => (
              <li key={friend.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{friendLabel(friend)}</p>
                    <p className="text-xs text-slate-500">{friendHandle(friend)}</p>
                  </div>
                  <form action={removeFriendAction.bind(null, friend.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
