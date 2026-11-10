/**
 * GUARDS — the deny list (docs/specs/vcfo-assist-agents/SAFETY.md, G1 to G7).
 *
 * Pure functions over plain "facts" objects, so they are tested without a browser. The DOM side
 * (`./dom.ts`) only collects facts; every decision is made here. A guard is not a setting: no
 * recipe, server response, AI answer or user preference reaches these functions as a switch.
 *
 * Every fill and every click in the extension goes through `allowFill` or `allowClick`
 * immediately before it happens. A refusal is final for that element; the engine logs it and
 * shows a "You do this" card instead of retrying.
 */
import type { GuardRefusal } from '../shared/types';

/** What the guards need to know about a form control. Values are never part of it. */
export interface FieldFacts {
  tag?: string;
  type?: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  aria?: string;
  autocomplete?: string;
  inputMode?: string;
  maxLength?: number;
  /** A captcha-looking `<img>` or `<canvas>` sits next to the control. */
  nearCaptchaImage?: boolean;
  /** The control is one of four or more one-character boxes in a row (an OTP strip). */
  inSingleCharGroup?: boolean;
}

/** What the guards need to know about a button or link. */
export interface ButtonFacts {
  text?: string;
  value?: string;
  aria?: string;
  title?: string;
  type?: string;
  id?: string;
  name?: string;
}

/**
 * Lowercase words from an attribute or label: camelCase, snake_case and kebab-case are split, so
 * `userId`, `user_id` and `user-id` all read "user id".
 */
export function words(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/[_\-.:/[\]()]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const CAPTCHA = /\bcaptcha\b|\bcapcha\b|\bcap\b|\bcaptch|characters shown|characters in the image|enter the (text|code|characters)|security code|verification image|image code|\bhuman\b/;
const OTP = /\botp\b|one time (password|pin|code)|onetime|verification code|\bsms code\b|\bauth(entication)? code\b/;
const PASSWORD = /\bpass ?word\b|\bpasswd\b|\bpwd\b|\bpass\b|\bpin\b(?! ?code)|\bmpin\b|\bsecret\b/;
const LOGIN = /\buser ?id\b|\buser ?name\b|\blogin\b|\blog in\b|\bsign in\b|\blogon\b/;

/** One regular expression covering the secret-field words, for the MAIN-world double check. */
export const SECRET_FIELD_PATTERN = new RegExp(
  [CAPTCHA.source, OTP.source, PASSWORD.source, LOGIN.source].join('|'),
);

/**
 * G1, G2, G3: password, captcha, OTP, user-id and login controls are never filled.
 * Returns the refusal, or null when the control may be filled.
 */
export function isSecretField(f: FieldFacts): GuardRefusal | null {
  const type = (f.type ?? '').toLowerCase();
  const auto = (f.autocomplete ?? '').toLowerCase();
  const text = words(f.name, f.id, f.label, f.placeholder, f.aria);

  if (type === 'password' || /current-password|new-password/.test(auto)) {
    return { code: 'G1', reason: 'password field' };
  }
  if (CAPTCHA.test(text) || f.nearCaptchaImage) {
    return { code: 'G2', reason: 'captcha field' };
  }
  if (auto.includes('one-time-code') || OTP.test(text)) {
    return { code: 'G3', reason: 'OTP field' };
  }
  if (f.inSingleCharGroup && (f.maxLength === 1 || /numeric|tel/.test((f.inputMode ?? '') + type))) {
    return { code: 'G3', reason: 'OTP digit box' };
  }
  if (PASSWORD.test(text)) {
    return { code: 'G1', reason: 'password field' };
  }
  if (auto === 'username' || LOGIN.test(text)) {
    return { code: 'G1', reason: 'login field' };
  }
  return null;
}

// A bare "Proceed" counts as submit: on MCA V3 it can lead to payment, and an unclear case is refused.
const SUBMIT = /\bsubmit\b|\bfinal\b|\bfile (now|form|return)\b|\bupload (form|to mca)\b|\bproceed\b/;
const PAY = /\bpay\b|\bpayment\b|\bpay ?now\b|\bmake payment\b|\bproceed to pay\b|\bchallan\b|\bnet ?banking\b|\bcheckout\b/;
const SIGN = /\baffix\b|\bsign\b|\besign\b|\bdsc\b|\bembridge\b/;
const LOGIN_BUTTON = /\blogin\b|\blog in\b|\bsign in\b|\blogon\b/;

/**
 * G4, G5, G6 (and G1 for Login buttons): a button whose text, value, aria label, id or name means
 * submit, final, pay, sign or log in is never clicked. A `type="submit"` button with no readable
 * text is refused too. Such buttons are only highlighted with "You click this".
 */
export function isForbiddenAction(b: ButtonFacts): GuardRefusal | null {
  const text = words(b.text, b.value, b.aria, b.title, b.id, b.name);
  if (LOGIN_BUTTON.test(text)) return { code: 'G1', reason: 'login button' };
  if (PAY.test(text)) return { code: 'G5', reason: 'payment button' };
  if (SIGN.test(text)) return { code: 'G6', reason: 'signing button' };
  if (SUBMIT.test(text)) return { code: 'G4', reason: 'submit button' };
  if ((b.type ?? '').toLowerCase() === 'submit' && !words(b.text, b.value, b.aria, b.title)) {
    return { code: 'G4', reason: 'unlabelled submit button' };
  }
  return null;
}

const FORBIDDEN_PAGE = /login|signin|sign-in|payment|paygov|pay-gov|netbanking|bank|checkout|billdesk|razorpay|payu|challan/i;

/** G5, G1: no fill and no click on a login, payment or bank page, whatever the recipe says. */
export function isForbiddenPage(url: string): GuardRefusal | null {
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.hostname}${u.pathname}`;
  } catch {
    // Not a URL: test the raw text.
  }
  if (FORBIDDEN_PAGE.test(path)) return { code: 'G5', reason: 'login or payment page' };
  return null;
}

/** The single gate every DOM write passes (SAFETY.md, "guard.allow(element, intent)"). */
export function allowFill(f: FieldFacts, pageUrl: string): GuardRefusal | null {
  return isForbiddenPage(pageUrl) ?? isSecretField(f);
}

/** The single gate every click passes. */
export function allowClick(b: ButtonFacts, pageUrl: string): GuardRefusal | null {
  return isForbiddenPage(pageUrl) ?? isForbiddenAction(b);
}
