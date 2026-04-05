'use server';

import { revalidatePath } from 'next/cache';
import { ensureProfileAndClient } from '@/lib/auth';

export type ProfileFormState = {
  error: string | null;
  success: string | null;
  values: {
    fullName: string;
    username: string;
  };
};

function normalizeValues(formData: FormData): ProfileFormState['values'] {
  return {
    fullName: String(formData.get('fullName') ?? ''),
    username: String(formData.get('username') ?? ''),
  };
}

function validate(values: ProfileFormState['values']) {
  const fullName = values.fullName.trim();
  if (!fullName) {
    return { error: 'Name is required.', fullName: '', username: '' };
  }

  const usernameInput = values.username.trim().toLowerCase();
  if (usernameInput && !/^[a-z0-9_]{3,30}$/.test(usernameInput)) {
    return {
      error: 'Username must be 3-30 characters and use only lowercase letters, numbers, or underscores.',
      fullName,
      username: usernameInput,
    };
  }

  return {
    error: null,
    fullName,
    username: usernameInput,
  };
}

export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const rawValues = normalizeValues(formData);
  const checked = validate(rawValues);

  if (checked.error) {
    return {
      error: checked.error,
      success: null,
      values: {
        fullName: checked.fullName,
        username: checked.username,
      },
    };
  }

  const { user, supabase } = await ensureProfileAndClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: checked.fullName,
      username: checked.username || null,
    })
    .eq('id', user.id);

  if (error) {
    if (error.code === '23505') {
      return {
        error: 'That username is already taken.',
        success: null,
        values: { fullName: checked.fullName, username: checked.username },
      };
    }

    return {
      error: `Could not update profile: ${error.message}`,
      success: null,
      values: { fullName: checked.fullName, username: checked.username },
    };
  }

  revalidatePath('/app');
  revalidatePath('/app/profile');

  return {
    error: null,
    success: 'Profile updated.',
    values: { fullName: checked.fullName, username: checked.username },
  };
}

