import 'server-only';

import { decryptTotpSecret } from './secret-box';
import { acceptTotpCounter, clearTotpFailures, isTotpLocked, recordTotpFailure } from './guard';
import { verifyTotp } from './totp';

export type TotpCheck = 'ok' | 'invalid' | 'locked';

/**
 * Checks a person's code against their sealed secret: the failure limit first,
 * then the code (one step of drift either side), then the replay guard. Used
 * by sign-in, the setup confirmation and turning two-step off.
 */
export async function checkTotpCode(userId: string, secretEnc: string | null | undefined, code: string): Promise<TotpCheck> {
  if (await isTotpLocked(userId)) return 'locked';
  const secret = decryptTotpSecret(userId, secretEnc);
  const counter = secret ? verifyTotp(secret, code) : null;
  if (counter === null || !acceptTotpCounter(userId, counter)) {
    await recordTotpFailure(userId);
    return 'invalid';
  }
  await clearTotpFailures(userId);
  return 'ok';
}
