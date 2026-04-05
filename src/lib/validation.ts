import { z } from 'zod';

export const authSchema = z.object({
  email: z.string().email('Valid email is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  fullName: z.string().trim().min(1, 'Name is required.').optional(),
  mode: z.enum(['sign-in', 'sign-up']),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, 'Group name must have at least 2 characters.'),
  description: z.string().trim().optional(),
  defaultCurrency: z.enum(['USD', 'MXN']),
  calculationMode: z.enum(['normal', 'reduced']),
});

export const createExpenseSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().trim().min(2, 'Title must be at least 2 characters.'),
  description: z.string().trim().optional(),
  amount: z.string().trim().min(1, 'Amount is required.'),
  tipPercentage: z.string().trim().optional(),
  deliveryFee: z.string().trim().optional(),
  currency: z.string().trim().length(3, 'Use a 3-letter currency code.'),
  expenseDate: z.string().trim().min(1, 'Date is required.'),
  paidBy: z.string().uuid('Paid by is required.'),
  splitType: z.enum(['equal', 'custom', 'percentage']),
});

export const createSettlementSchema = z.object({
  groupId: z.string().uuid(),
  amount: z.string().trim().min(1, 'Amount is required.'),
  currency: z.string().trim().length(3, 'Use a 3-letter currency code.'),
  settledOn: z.string().trim().min(1, 'Date is required.'),
  payerId: z.string().uuid('Payer is required.'),
  receiverId: z.string().uuid('Receiver is required.'),
  note: z.string().trim().optional(),
});
