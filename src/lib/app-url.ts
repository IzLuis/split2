import { headers } from 'next/headers';

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

export async function getAppBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return normalizeBaseUrl(envUrl);
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim().length > 0) {
    return `https://${normalizeBaseUrl(vercelUrl)}`;
  }

  const headerStore = await headers();
  const origin = headerStore.get('origin');
  if (origin) {
    return normalizeBaseUrl(origin);
  }

  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  if (!host) {
    return null;
  }

  const proto = headerStore.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function getAuthEmailRedirectUrl(path = '/login') {
  const baseUrl = await getAppBaseUrl();
  if (!baseUrl) {
    return undefined;
  }

  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

