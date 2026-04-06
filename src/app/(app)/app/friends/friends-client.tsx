'use client';

import { useActionState } from 'react';
import { FormSubmit } from '@/components/form-submit';
import { PageHeader } from '@/components/page-header';
import { tx, type Locale } from '@/lib/i18n/shared';
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

function translateFriendMessage(locale: Locale, message: string) {
  if (locale !== 'es') return message;

  if (message === 'Enter an email or username.') return 'Ingresa un correo o nombre de usuario.';
  if (message === 'No user found with that email/username.') return 'No se encontró un usuario con ese correo/nombre de usuario.';
  if (message === 'You cannot add yourself as a friend.') return 'No puedes agregarte a ti mismo como amigo.';
  if (message === 'You are already friends with this user.') return 'Ya eres amigo de este usuario.';
  if (message === 'You already sent a friend request to this user.') return 'Ya enviaste una solicitud a este usuario.';
  if (message === 'This user already sent you a request. Accept it below.') return 'Este usuario ya te envió una solicitud. Acéptala abajo.';
  if (message === 'Friend request sent.') return 'Solicitud de amistad enviada.';
  if (message.startsWith('Could not find user by email:')) {
    return message.replace('Could not find user by email:', 'No se pudo buscar el usuario por correo:');
  }
  if (message.startsWith('Could not find user by username:')) {
    return message.replace('Could not find user by username:', 'No se pudo buscar el usuario por nombre de usuario:');
  }
  if (message.startsWith('Could not check friendship status:')) {
    return message.replace('Could not check friendship status:', 'No se pudo verificar el estado de amistad:');
  }
  if (message.startsWith('Could not check pending requests:')) {
    return message.replace('Could not check pending requests:', 'No se pudieron verificar las solicitudes pendientes:');
  }
  if (message.startsWith('Could not send friend request:')) {
    return message.replace('Could not send friend request:', 'No se pudo enviar la solicitud de amistad:');
  }

  return message;
}

export function FriendsClient({
  locale,
  initialState,
  incomingRequests,
  outgoingRequests,
  friends,
}: {
  locale: Locale;
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
        backLabel={tx(locale, 'Back to dashboard', 'Volver al panel')}
        title={tx(locale, 'Friends', 'Amigos')}
        description={tx(
          locale,
          'Add friends by email/username to quickly invite them into new groups.',
          'Agrega amigos por correo/nombre de usuario para invitarlos rápidamente a nuevos grupos.',
        )}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Add friend', 'Agregar amigo')}</h2>
        <form action={action} className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Email or username', 'Correo o nombre de usuario')}</span>
            <input
              name="identifier"
              placeholder={tx(locale, 'friend@email.com or username', 'amigo@email.com o usuario')}
              defaultValue={state.values.identifier}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          {state.error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {translateFriendMessage(locale, state.error)}
            </p>
          ) : null}

          {state.success ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {translateFriendMessage(locale, state.success)}
            </p>
          ) : null}

          <FormSubmit pendingText={tx(locale, 'Sending request...', 'Enviando solicitud...')}>
            {tx(locale, 'Send request', 'Enviar solicitud')}
          </FormSubmit>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Incoming requests', 'Solicitudes recibidas')}</h2>
        {incomingRequests.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{tx(locale, 'No incoming requests.', 'No hay solicitudes recibidas.')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {incomingRequests.map((request) => (
              <li key={request.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{friendLabel(request.requester)}</p>
                <p className="text-xs text-slate-500">{friendHandle(request.requester)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {tx(locale, 'Requested on', 'Solicitada el')} {formatDate(request.created_at, locale)}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <form action={acceptFriendRequestAction.bind(null, request.id)}>
                    <button
                      type="submit"
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      {tx(locale, 'Accept', 'Aceptar')}
                    </button>
                  </form>
                  <form action={declineFriendRequestAction.bind(null, request.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {tx(locale, 'Decline', 'Rechazar')}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Outgoing requests', 'Solicitudes enviadas')}</h2>
        {outgoingRequests.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{tx(locale, 'No pending outgoing requests.', 'No hay solicitudes enviadas pendientes.')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {outgoingRequests.map((request) => (
              <li key={request.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{friendLabel(request.addressee)}</p>
                <p className="text-xs text-slate-500">{friendHandle(request.addressee)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {tx(locale, 'Requested on', 'Solicitada el')} {formatDate(request.created_at, locale)}
                </p>
                <form action={cancelFriendRequestAction.bind(null, request.id)} className="mt-3">
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {tx(locale, 'Cancel request', 'Cancelar solicitud')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Your friends', 'Tus amigos')}</h2>
        {friends.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{tx(locale, 'No friends yet.', 'Aún no tienes amigos.')}</p>
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
                      {tx(locale, 'Remove', 'Eliminar')}
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
