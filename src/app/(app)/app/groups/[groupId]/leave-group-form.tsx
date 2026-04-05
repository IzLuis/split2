'use client';

import { useActionState } from 'react';
import { useActionToast } from '@/components/action-toast';
import { tx, type Locale } from '@/lib/i18n/shared';
import { leaveGroupAction, type LeaveGroupActionState } from './actions';

const initialState: LeaveGroupActionState = {
  success: false,
  message: '',
  timestamp: 0,
  values: {},
};

export function LeaveGroupForm({
  groupId,
  locale,
}: {
  groupId: string;
  locale: Locale;
}) {
  const [state, formAction] = useActionState(leaveGroupAction.bind(null, groupId), initialState);
  useActionToast(state, { redirectMode: 'replace', refreshOnRedirect: true });

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            tx(
              locale,
              'Leave this group? You will lose access to its details.',
              '¿Salir de este grupo? Perderás acceso a sus detalles.',
            ),
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-50"
      >
        {tx(locale, 'Leave group', 'Salir del grupo')}
      </button>
    </form>
  );
}
