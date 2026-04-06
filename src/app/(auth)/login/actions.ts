'use server';

import { redirect } from 'next/navigation';
import { getAuthEmailRedirectUrl } from '@/lib/app-url';
import { authSchema } from '@/lib/validation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AuthFormState = {
  error: string | null;
};

export async function submitAuthAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = authSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName') || undefined,
    mode: formData.get('mode'),
  });

  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? 'Invalid form input.' };
  }

  const supabase = await createSupabaseServerClient();
  const { email, password, fullName, mode } = validated.data;

  if (mode === 'sign-up') {
    const emailRedirectTo = await getAuthEmailRedirectUrl('/login');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return { error: error.message };
    }

    redirect('/login?created=1');
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect('/app');
}
