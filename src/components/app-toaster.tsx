'use client';

import { Toaster } from 'sonner';

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      theme="system"
      richColors
      expand={false}
      toastOptions={{
        duration: 2600,
      }}
    />
  );
}
