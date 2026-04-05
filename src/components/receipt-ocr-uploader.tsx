'use client';

import { useEffect, useRef, useState } from 'react';
import { tx, type Locale } from '@/lib/i18n/shared';
import type { ReceiptOcrResult } from '@/lib/receipt-ocr';

type OcrResponse = {
  receipt?: ReceiptOcrResult;
  error?: string;
};

const CLIENT_SCAN_COOLDOWN_MS = 15_000;

export function ReceiptOcrUploader({
  onParsed,
  locale = 'en',
}: {
  onParsed: (receipt: ReceiptOcrResult) => void;
  locale?: Locale;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      return;
    }

    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= cooldownUntil) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownUntil]);

  async function handleScan() {
    if (cooldownSeconds > 0) {
      setError(
        tx(
          locale,
          `Please wait ${cooldownSeconds}s before scanning again.`,
          `Espera ${cooldownSeconds}s antes de escanear de nuevo.`,
        ),
      );
      setInfo(null);
      return;
    }

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError(tx(locale, 'Choose a receipt image first.', 'Primero elige una imagen del ticket.'));
      setInfo(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfo(null);

    try {
      const formData = new FormData();
      formData.append('receipt', file);

      const response = await fetch('/api/ocr/receipt', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as OcrResponse;
      if (!response.ok || !payload.receipt) {
        setError(payload.error ?? tx(locale, 'Could not read this receipt image.', 'No se pudo leer esta imagen de ticket.'));
        return;
      }

      onParsed(payload.receipt);
      setInfo(tx(locale, 'Receipt scanned. Review values before saving.', 'Ticket escaneado. Revisa los valores antes de guardar.'));
      if (payload.receipt.warnings.length > 0) {
        setInfo(
          tx(
            locale,
            `Receipt scanned with warnings: ${payload.receipt.warnings.join(' | ')}`,
            `Ticket escaneado con advertencias: ${payload.receipt.warnings.join(' | ')}`,
          ),
        );
      }
    } catch {
      setError(tx(locale, 'Receipt scanning failed. Please try again.', 'Falló el escaneo del ticket. Inténtalo de nuevo.'));
    } finally {
      setIsLoading(false);
      setCooldownUntil(Date.now() + CLIENT_SCAN_COOLDOWN_MS);
      setNow(Date.now());
    }
  }

  return (
    <section className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-700">{tx(locale, 'Receipt OCR (beta)', 'OCR de Ticket (beta)')}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700"
        />
        <button
          type="button"
          onClick={handleScan}
          disabled={isLoading || cooldownSeconds > 0}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading
            ? tx(locale, 'Scanning...', 'Escaneando...')
            : cooldownSeconds > 0
              ? tx(locale, `Wait ${cooldownSeconds}s`, `Espera ${cooldownSeconds}s`)
              : tx(locale, 'Scan receipt', 'Escanear ticket')}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {tx(
          locale,
          'Upload a receipt photo to auto-fill an itemized expense with detected items and totals. A short cooldown helps avoid duplicate scans.',
          'Sube una foto del ticket para autocompletar un gasto itemizado con artículos y totales detectados. Un pequeño enfriamiento ayuda a evitar escaneos duplicados.',
        )}
      </p>
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}
      {info ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{info}</p>
      ) : null}
    </section>
  );
}
