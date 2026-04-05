import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExpenseEvent } from '@/lib/types';

export const DEFAULT_EXPENSE_EVENT_COLOR = '#64748B';

export function normalizeExpenseEventColor(input: string | null | undefined) {
  const normalized = String(input ?? '').trim();
  if (!normalized) {
    return DEFAULT_EXPENSE_EVENT_COLOR;
  }

  const expanded = normalized.startsWith('#') ? normalized : `#${normalized}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(expanded)) {
    return null;
  }

  return expanded.toUpperCase();
}

export async function getGroupExpenseEvents(
  supabase: SupabaseClient,
  groupId: string,
): Promise<ExpenseEvent[]> {
  const { data, error } = await supabase
    .from('expense_events')
    .select('id, name, color')
    .eq('group_id', groupId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Could not load expense events: ${error.message}`);
  }

  return (data ?? []) as ExpenseEvent[];
}

export async function resolveExpenseEventForSave(
  supabase: SupabaseClient,
  params: {
    groupId: string;
    userId: string;
    selectedEventId: string;
    newEventName: string;
    newEventColor: string;
  },
): Promise<{ eventId: string | null; error: string | null }> {
  const selectedEventId = params.selectedEventId.trim();
  const newEventName = params.newEventName.trim();

  if (newEventName) {
    if (newEventName.length > 40) {
      return { eventId: null, error: 'Event name must be 40 characters or fewer.' };
    }

    const color = normalizeExpenseEventColor(params.newEventColor);
    if (!color) {
      return { eventId: null, error: 'Event color must be a valid hex color.' };
    }

    const { data: insertedEvent, error: insertError } = await supabase
      .from('expense_events')
      .insert({
        group_id: params.groupId,
        name: newEventName,
        color,
        created_by: params.userId,
      })
      .select('id')
      .single();

    if (!insertError && insertedEvent) {
      return { eventId: insertedEvent.id as string, error: null };
    }

    if (insertError?.code === '23505') {
      const { data: existingEvent, error: existingError } = await supabase
        .from('expense_events')
        .select('id')
        .eq('group_id', params.groupId)
        .ilike('name', newEventName)
        .limit(1)
        .maybeSingle();

      if (existingError) {
        return { eventId: null, error: `Could not load existing event: ${existingError.message}` };
      }

      if (existingEvent) {
        return { eventId: existingEvent.id as string, error: null };
      }
    }

    return { eventId: null, error: insertError?.message ?? 'Could not create event.' };
  }

  if (!selectedEventId) {
    return { eventId: null, error: null };
  }

  const { data: existingEvent, error: existingError } = await supabase
    .from('expense_events')
    .select('id')
    .eq('group_id', params.groupId)
    .eq('id', selectedEventId)
    .maybeSingle();

  if (existingError) {
    return { eventId: null, error: `Could not validate selected event: ${existingError.message}` };
  }

  if (!existingEvent) {
    return { eventId: null, error: 'Selected event is not valid for this group.' };
  }

  return { eventId: selectedEventId, error: null };
}
