'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { submitAuthAction, type AuthFormState } from './actions';
import { FormSubmit } from '@/components/form-submit';
import { useUiLocale } from '@/lib/i18n/client';
import { tx } from '@/lib/i18n/shared';

const initialState: AuthFormState = {
  error: null,
};

export default function LoginPage() {
  const locale = useUiLocale();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [state, action] = useActionState(submitAuthAction, initialState);
  const title = mode === 'sign-in'
    ? tx(locale, 'Welcome back', 'Qué bueno verte de nuevo')
    : tx(locale, 'Create your account', 'Crea tu cuenta');

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto mt-8 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:mt-16">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {tx(locale, 'Split expenses with your people and keep balances clear.', 'Divide gastos con tu gente y mantén los balances claros.')}
        </p>

        <div className="mt-6 inline-flex rounded-md border border-slate-200 p-1">
          <button
            type="button"
            onClick={() => setMode('sign-in')}
            className={`rounded px-3 py-1 text-sm ${
              mode === 'sign-in' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            {tx(locale, 'Sign in', 'Iniciar sesión')}
          </button>
          <button
            type="button"
            onClick={() => setMode('sign-up')}
            className={`rounded px-3 py-1 text-sm ${
              mode === 'sign-up' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            {tx(locale, 'Sign up', 'Crear cuenta')}
          </button>
        </div>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="mode" value={mode} />

          {mode === 'sign-up' ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{tx(locale, 'Full name', 'Nombre completo')}</span>
              <input
                name="fullName"
                placeholder={tx(locale, 'Alex', 'Alex')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
              />
            </label>
          ) : null}

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Email', 'Correo')}</span>
            <input
              required
              name="email"
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{tx(locale, 'Password', 'Contraseña')}</span>
            <input
              required
              name="password"
              type="password"
              placeholder={tx(locale, 'Minimum 6 characters', 'Mínimo 6 caracteres')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
            />
          </label>

          {state.error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          ) : null}

          <FormSubmit
            pendingText={mode === 'sign-in'
              ? tx(locale, 'Signing in...', 'Iniciando sesión...')
              : tx(locale, 'Creating account...', 'Creando cuenta...')}
          >
            {mode === 'sign-in'
              ? tx(locale, 'Sign in', 'Iniciar sesión')
              : tx(locale, 'Create account', 'Crear cuenta')}
          </FormSubmit>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          {tx(locale, 'By continuing, you agree this is your personal app instance.', 'Al continuar, aceptas que esta es tu instancia personal de la app.')}
        </p>

        <p className="mt-2 text-xs text-slate-500">
          {tx(
            locale,
            'If sign up requires confirmation email in your Supabase project settings, confirm first and then sign in.',
            'Si el registro requiere confirmación por email en Supabase, confirma primero y luego inicia sesión.',
          )}
        </p>

        <Link href="https://supabase.com/docs/guides/auth" className="mt-4 inline-block text-xs text-slate-500 underline">
          {tx(locale, 'Supabase auth docs', 'Documentación de auth de Supabase')}
        </Link>
      </div>
    </main>
  );
}
