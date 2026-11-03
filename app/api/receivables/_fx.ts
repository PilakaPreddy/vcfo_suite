import { z } from 'zod';
import { FOREIGN_CURRENCY_CODES } from '@/lib/receivables/currencies';
import { isoDate } from './_respond';

/** Field schemas of the Phase 10 forward contract and rate alert routes. */
export const foreignCurrency = z.enum(FOREIGN_CURRENCY_CODES, { message: 'currency' });

export const forwardFields = {
  currency: foreignCurrency,
  bank: z.string().trim().min(1, 'bank').max(80, 'bank'),
  contractNo: z.string().max(60, 'contract_no').nullable().optional(),
  amountFc: z.number().positive('amount_fc').max(1e12, 'amount_fc'),
  forwardRate: z.number().positive('forward_rate').max(100_000, 'forward_rate'),
  bookedOn: isoDate,
  maturityOn: isoDate,
  note: z.string().max(200, 'note').nullable().optional(),
};

export const alertFields = {
  currency: foreignCurrency,
  direction: z.enum(['above', 'below'], { message: 'direction' }),
  threshold: z.number().positive('threshold').max(100_000, 'threshold'),
};
