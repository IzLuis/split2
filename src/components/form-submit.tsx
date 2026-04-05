'use client';

import { useFormStatus } from 'react-dom';

type FormSubmitProps = {
  children: React.ReactNode;
  pendingText?: string;
};

export function FormSubmit({ children, pendingText = 'Saving...' }: FormSubmitProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingText : children}
    </button>
  );
}
