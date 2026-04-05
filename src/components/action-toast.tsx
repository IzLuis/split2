'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { resolveLocale, type Locale } from '@/lib/i18n/shared';

function translateToastMessage(message: string, locale: Locale) {
  if (locale !== 'es') {
    return message;
  }

  if (message === 'Expense created successfully.') return 'Gasto creado correctamente.';
  if (message === 'Expense updated successfully.') return 'Gasto actualizado correctamente.';
  if (message === 'Expense deleted successfully.') return 'Gasto eliminado correctamente.';
  if (message === 'Settlement recorded successfully.') return 'Pago registrado correctamente.';
  if (message === 'Group created successfully.') return 'Grupo creado correctamente.';
  if (message === 'Group updated successfully.') return 'Grupo actualizado correctamente.';
  if (message === 'You left the group.') return 'Saliste del grupo.';
  if (message === 'Group owners cannot leave the group.') return 'Los propietarios del grupo no pueden salir.';
  if (message === 'You already left this group.') return 'Ya saliste de este grupo.';

  if (message.startsWith('Members updated:')) {
    return message
      .replace('Members updated:', 'Miembros actualizados:')
      .replace('added', 'agregados')
      .replace('invited', 'invitados');
  }

  if (message.startsWith('Could not delete group:')) {
    return message.replace('Could not delete group:', 'No se pudo eliminar el grupo:');
  }

  if (message.startsWith('Could not delete expense:')) {
    return message.replace('Could not delete expense:', 'No se pudo eliminar el gasto:');
  }

  if (message.startsWith('Could not leave the group')) {
    return message.replace('Could not leave the group', 'No se pudo salir del grupo');
  }

  if (message.startsWith('Only the group owner can delete this group.')) {
    return 'Solo el propietario del grupo puede eliminar este grupo.';
  }

  if (
    message ===
    'You cannot leave yet because your past expenses, settlements, or shares are still linked to this group.'
  ) {
    return 'Aún no puedes salir porque tus gastos, pagos o participaciones históricas siguen vinculados a este grupo.';
  }

  return message;
}

export function useActionToast(state: {
  success: boolean;
  message: string;
  timestamp: number;
  redirectTo?: string;
}, options?: {
  refreshOnRedirect?: boolean;
  redirectMode?: 'push' | 'replace';
}) {
  const router = useRouter();
  const handledTimestampRef = useRef<number>(0);
  const refreshOnRedirect = options?.refreshOnRedirect ?? false;
  const redirectMode = options?.redirectMode ?? 'push';

  useEffect(() => {
    if (!state.message || state.timestamp <= 0) {
      return;
    }

    if (handledTimestampRef.current === state.timestamp) {
      return;
    }
    handledTimestampRef.current = state.timestamp;
    const locale = resolveLocale(document?.documentElement?.lang);
    const translatedMessage = translateToastMessage(state.message, locale);

    if (state.success) {
      toast.success(translatedMessage);
      if (state.redirectTo) {
        if (redirectMode === 'replace') {
          router.replace(state.redirectTo);
        } else {
          router.push(state.redirectTo);
        }
        if (refreshOnRedirect) {
          router.refresh();
        }
      }
      return;
    }

    toast.error(translatedMessage);
  }, [redirectMode, refreshOnRedirect, router, state.message, state.redirectTo, state.success, state.timestamp]);
}
