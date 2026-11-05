import 'server-only';

import { isWhatsAppConfigured, readWhatsAppConfig, type WhatsAppConfig } from '@/lib/notify/channels';
import { toMetaPhone } from '@/lib/notify/phone';
import type { SendWhatsAppDeps } from '@/lib/notify/send-whatsapp-shared';

/**
 * WhatsApp verification code (C-868), sent before a person turns WhatsApp on.
 *
 * It rides the same transport as every other WhatsApp message (AWS End User Messaging, the
 * origination number in `EUM_PHONE_NUMBER_ID`, the instance role), but it is not one of the
 * nudge events: the code goes out before consent, and Meta only lets a code travel in an
 * approved AUTHENTICATION template. Name that template in `WHATSAPP_TEMPLATE_NAME_VERIFY_CODE`.
 * Without it, or with WhatsApp off, the feature reports "not set up" and nothing is sent.
 *
 * Contract: never throws.
 */

function verifyTemplateName(env: NodeJS.ProcessEnv = process.env): string {
  return env.WHATSAPP_TEMPLATE_NAME_VERIFY_CODE?.trim() ?? '';
}

/** True when a code can be sent: WhatsApp is on, a number id is set and the template is named. */
export function isWhatsAppCodeSetUp(config?: WhatsAppConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  return isWhatsAppConfigured(config ?? readWhatsAppConfig(env)) && verifyTemplateName(env) !== '';
}

/** The Cloud API payload of a copy-code authentication template: the code in the body and the button. */
function verifyCodePayload(input: { toPhone: string; code: string; template: string; language: string }): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to: toMetaPhone(input.toPhone),
    type: 'template',
    template: {
      name: input.template,
      language: { code: input.language },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: input.code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.code }] },
      ],
    },
  };
}

export type WhatsAppCodeResult = { ok: boolean; reason?: 'not_set_up' | 'failed' };

export async function sendWhatsAppCode(input: { toPhone: string; code: string; deps?: SendWhatsAppDeps; env?: NodeJS.ProcessEnv }): Promise<WhatsAppCodeResult> {
  const env = input.env ?? process.env;
  const config = input.deps?.config ?? readWhatsAppConfig(env);
  const template = verifyTemplateName(env);
  if (!isWhatsAppConfigured(config) || !template) return { ok: false, reason: 'not_set_up' };
  try {
    const send =
      (await input.deps?.createEumClient?.(config)) ??
      (await (async () => {
        const { SocialMessagingClient, SendWhatsAppMessageCommand } = await import('@aws-sdk/client-socialmessaging');
        const client = new SocialMessagingClient(config.eum.region ? { region: config.eum.region } : {});
        return async (params: { originationPhoneNumberId: string; metaApiVersion: string; message: Uint8Array }) =>
          client.send(new SendWhatsAppMessageCommand(params));
      })());
    const payload = verifyCodePayload({ toPhone: input.toPhone, code: input.code, template, language: config.eum.templateLanguage });
    const result = await send({
      originationPhoneNumberId: config.eum.phoneNumberId,
      metaApiVersion: config.eum.metaApiVersion,
      message: new TextEncoder().encode(JSON.stringify(payload)),
    });
    return result?.messageId?.trim() ? { ok: true } : { ok: false, reason: 'failed' };
  } catch (err) {
    console.error('[whatsapp:code] send failed', err instanceof Error ? err.message : err);
    return { ok: false, reason: 'failed' };
  }
}
