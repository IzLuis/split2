import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import type { ReceiptOcrResult } from '@/lib/receipt-ocr';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_RECEIPT_FILE_BYTES = 8 * 1024 * 1024;

const ocrItemSchema = z.object({
  name: z.string().optional().nullable(),
  quantity: z.union([z.number(), z.string()]).optional().nullable(),
  unit_price: z.union([z.number(), z.string()]).optional().nullable(),
  line_total: z.union([z.number(), z.string()]).optional().nullable(),
});

const ocrResponseSchema = z.object({
  merchant_name: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  subtotal: z.union([z.number(), z.string()]).optional().nullable(),
  tax_amount: z.union([z.number(), z.string()]).optional().nullable(),
  tax_included: z.union([z.boolean(), z.string()]).optional().nullable(),
  total: z.union([z.number(), z.string()]).optional().nullable(),
  tip_amount: z.union([z.number(), z.string()]).optional().nullable(),
  delivery_fee: z.union([z.number(), z.string()]).optional().nullable(),
  raw_text: z.string().optional().nullable(),
  items: z.array(ocrItemSchema).optional().nullable(),
});

function money(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return Math.round(value * 100) / 100;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9,.-]/g, '').trim();
    if (!normalized) {
      return null;
    }

    const candidate =
      normalized.includes(',') && !normalized.includes('.')
        ? normalized.replace(',', '.')
        : normalized.replace(/,/g, '');

    const parsed = Number(candidate);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return Math.round(parsed * 100) / 100;
  }

  return null;
}

function count(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.round(value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.round(parsed));
    }
  }
  return 1;
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function normalizeDate(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const directIsoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (directIsoMatch) {
    const year = Number(directIsoMatch[1]);
    const month = Number(directIsoMatch[2]);
    const day = Number(directIsoMatch[3]);
    if (
      Number.isInteger(year)
      && Number.isInteger(month)
      && Number.isInteger(day)
      && month >= 1
      && month <= 12
      && day >= 1
      && day <= 31
    ) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dayFirstMatch = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    let year = Number(dayFirstMatch[3]);
    if (year < 100) {
      year += 2000;
    }

    // Mexico day-first default for ambiguous numeric dates.
    if (
      Number.isInteger(year)
      && Number.isInteger(month)
      && Number.isInteger(day)
      && month >= 1
      && month <= 12
      && day >= 1
      && day <= 31
    ) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function parseJsonObject(rawText: string) {
  try {
    return JSON.parse(rawText);
  } catch {
    const codeBlock = rawText.match(/```json\s*([\s\S]*?)\s*```/i);
    if (codeBlock?.[1]) {
      return JSON.parse(codeBlock[1]);
    }

    const objectMatch = rawText.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error('Could not parse OCR model response as JSON.');
  }
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeReceiptData(payload: z.infer<typeof ocrResponseSchema>): ReceiptOcrResult {
  const warnings: string[] = [];

  const parsedItems = (payload.items ?? [])
    .map((item) => {
      const name = String(item.name ?? '').trim();
      if (!name) {
        return null;
      }

      const quantity = count(item.quantity);
      const lineTotal = money(item.line_total);
      const unitPrice = money(item.unit_price);

      if (lineTotal === null && unitPrice === null) {
        return null;
      }

      const resolvedLineTotal =
        lineTotal !== null ? lineTotal : Math.round((unitPrice ?? 0) * quantity * 100) / 100;

      const resolvedUnitPrice =
        unitPrice !== null
          ? unitPrice
          : quantity > 0
            ? Math.round((resolvedLineTotal / quantity) * 100) / 100
            : null;

      if (resolvedLineTotal <= 0) {
        return null;
      }

      return {
        name,
        quantity,
        unitPrice: resolvedUnitPrice,
        lineTotal: resolvedLineTotal,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (parsedItems.length === 0) {
    throw new Error('No valid line items detected in receipt.');
  }

  const subtotalFromItems = Math.round(
    parsedItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100,
  ) / 100;
  const detectedSubtotal = money(payload.subtotal);
  const subtotalAmount = subtotalFromItems;

  if (detectedSubtotal !== null && Math.abs(detectedSubtotal - subtotalFromItems) > 0.05) {
    warnings.push('Detected subtotal differed from line items. Using line item subtotal.');
  }

  const taxAmount = money(payload.tax_amount);
  const tipAmount = money(payload.tip_amount);
  let deliveryFee = money(payload.delivery_fee);
  const taxIncludedByFlag = parseBoolean(payload.tax_included);
  const rawText = String(payload.raw_text ?? '').toLowerCase();
  const taxIncludedByText = /iva\\s+incluid|impuesto[s]?\\s+incluid|tax\\s+included/.test(rawText);
  const taxIncluded = taxIncludedByFlag || taxIncludedByText;

  if (taxAmount !== null && taxAmount > 0) {
    if (taxIncluded) {
      warnings.push(
        `Tax detected (${taxAmount.toFixed(2)}) but marked as included in prices, so it was not added to delivery fee.`,
      );
    } else {
      deliveryFee = Math.round(((deliveryFee ?? 0) + taxAmount) * 100) / 100;
      warnings.push(
        `Tax detected (${taxAmount.toFixed(2)}) and mapped into delivery fee for this MVP model.`,
      );
    }
  }

  let totalAmount = money(payload.total);
  if (totalAmount === null) {
    totalAmount = Math.round((subtotalAmount + (tipAmount ?? 0) + (deliveryFee ?? 0)) * 100) / 100;
  }

  if (totalAmount !== null) {
    const knownAmount = Math.round((subtotalAmount + (tipAmount ?? 0) + (deliveryFee ?? 0)) * 100) / 100;
    const delta = Math.round((totalAmount - knownAmount) * 100) / 100;

    if (Math.abs(delta) >= 0.01) {
      if (delta > 0) {
        deliveryFee = Math.round(((deliveryFee ?? 0) + delta) * 100) / 100;
        warnings.push('Uncategorized extra amount was placed in delivery fee to match receipt total.');
      } else {
        warnings.push(`Receipt total mismatch detected (${delta.toFixed(2)}). Review values before saving.`);
      }
    }
  }

  return {
    title: String(payload.merchant_name ?? '').trim() || 'Receipt expense',
    expenseDate: normalizeDate(payload.date),
    currency: normalizeCurrency(payload.currency),
    subtotalAmount,
    totalAmount,
    tipAmount,
    deliveryFee,
    warnings,
    items: parsedItems,
  };
}

function getCooldownSeconds() {
  const parsed = Number(process.env.OPENAI_OCR_COOLDOWN_SECONDS ?? '20');
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 20;
  }
  return Math.round(parsed);
}

function getDailyLimit() {
  const parsed = Number(process.env.OPENAI_OCR_DAILY_LIMIT ?? '30');
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 30;
  }
  return Math.round(parsed);
}

async function enforceCostGuards(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const now = Date.now();
  const cooldownSeconds = getCooldownSeconds();
  const dailyLimit = getDailyLimit();
  const utcStartOfDay = new Date();
  utcStartOfDay.setUTCHours(0, 0, 0, 0);

  const [latestRequestResult, todayCountResult] = await Promise.all([
    supabase
      .from('receipt_ocr_requests')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('receipt_ocr_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', utcStartOfDay.toISOString()),
  ]);

  if (latestRequestResult.error) {
    return { error: `Could not validate OCR cooldown: ${latestRequestResult.error.message}` };
  }

  if (todayCountResult.error) {
    return { error: `Could not validate OCR usage limit: ${todayCountResult.error.message}` };
  }

  const latestRequestAt = latestRequestResult.data?.[0]?.created_at
    ? new Date(latestRequestResult.data[0].created_at).getTime()
    : null;

  if (latestRequestAt && cooldownSeconds > 0) {
    const elapsedSeconds = Math.floor((now - latestRequestAt) / 1000);
    if (elapsedSeconds < cooldownSeconds) {
      return {
        error: `Please wait ${cooldownSeconds - elapsedSeconds}s before scanning another receipt.`,
        status: 429,
      };
    }
  }

  const todayCount = todayCountResult.count ?? 0;
  if (todayCount >= dailyLimit) {
    return {
      error: `Daily OCR limit reached (${dailyLimit}/day). Try again tomorrow.`,
      status: 429,
    };
  }

  const { error: insertError } = await supabase.from('receipt_ocr_requests').insert({
    user_id: userId,
  });

  if (insertError) {
    return { error: `Could not track OCR usage: ${insertError.message}` };
  }

  return { error: null, status: 200 };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured.' },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('receipt');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Receipt image is required.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Please upload an image file.' }, { status: 400 });
  }

  if (file.size > MAX_RECEIPT_FILE_BYTES) {
    return NextResponse.json(
      { error: 'Image is too large. Max size is 8MB.' },
      { status: 400 },
    );
  }

  const costGuards = await enforceCostGuards(supabase, authData.user.id);
  if (costGuards.error) {
    return NextResponse.json(
      { error: costGuards.error },
      { status: costGuards.status ?? 500 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_OCR_MODEL ?? 'gpt-4.1-mini';

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You extract structured receipt data. Return JSON only with exact keys: merchant_name, date, currency, subtotal, tax_amount, tax_included, total, tip_amount, delivery_fee, raw_text, items. Each item: name, quantity, unit_price, line_total. Prefer date format DD/MM/YYYY when the receipt date is numeric.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                'Parse this receipt image. Infer quantities and line totals carefully. Keep numbers as decimals in major currency units (e.g., 12.50). If the receipt says IVA/Tax is included (like "IVA incluido"), set tax_included=true and do not treat it as an extra fee. For ambiguous numeric dates, interpret them day-first (DD/MM/YYYY).',
            },
            {
              type: 'input_image',
              image_url: dataUrl,
              detail: 'low',
            },
          ],
        },
      ],
    });

    const rawOutput = response.output_text?.trim();
    if (!rawOutput) {
      return NextResponse.json(
        { error: 'OCR returned no output.' },
        { status: 502 },
      );
    }

    const parsedJson = parseJsonObject(rawOutput);
    const validated = ocrResponseSchema.parse(parsedJson);
    const receipt = normalizeReceiptData(validated);

    return NextResponse.json({ receipt });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Could not scan receipt: ${error.message}`
            : 'Could not scan receipt.',
      },
      { status: 502 },
    );
  }
}
