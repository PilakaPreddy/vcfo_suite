/**
 * The DOM side of the guards: it collects facts about an element and hands them to the pure
 * deny list in `./index.ts`. Nothing here decides; nothing here reads a control's value.
 */
import { allowClick, allowFill, type ButtonFacts, type FieldFacts } from './index';
import { clean, labelFor } from '../portal/label';
import type { GuardRefusal } from '../shared/types';

const CAPTCHA_IMG = /captcha|capcha|verify|security|challenge/i;

/** A captcha-looking image or canvas within the control's own field box. */
function nearCaptchaImage(el: Element): boolean {
  const box = el.closest('.guideFieldNode, .form-group, .field, label, td, li, div');
  if (!box) return false;
  const images = Array.from(box.querySelectorAll('img, canvas'));
  return images.some((img) => {
    const facts = [img.getAttribute('src'), img.getAttribute('alt'), img.getAttribute('id'), img.getAttribute('class'), img.getAttribute('title')].join(' ');
    return img.tagName === 'CANVAS' || CAPTCHA_IMG.test(facts);
  });
}

/** Four or more one-character inputs side by side: the usual OTP strip. */
function inSingleCharGroup(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  const boxes = Array.from(parent.querySelectorAll('input')).filter((i) => i.maxLength === 1);
  return boxes.length >= 4 && boxes.includes(el as HTMLInputElement);
}

export function fieldFacts(el: Element): FieldFacts {
  const input = el as HTMLInputElement;
  return {
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') ?? (el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
    name: el.getAttribute('name') ?? '',
    id: el.getAttribute('id') ?? '',
    label: labelFor(el),
    placeholder: el.getAttribute('placeholder') ?? '',
    aria: el.getAttribute('aria-label') ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    inputMode: el.getAttribute('inputmode') ?? '',
    maxLength: typeof input.maxLength === 'number' && input.maxLength > 0 ? input.maxLength : undefined,
    nearCaptchaImage: nearCaptchaImage(el),
    inSingleCharGroup: inSingleCharGroup(el),
  };
}

export function buttonFacts(el: Element): ButtonFacts {
  const input = el as HTMLInputElement;
  return {
    text: clean((el as HTMLElement).innerText || el.textContent),
    value: el.tagName === 'INPUT' ? input.value : '',
    aria: el.getAttribute('aria-label') ?? '',
    title: el.getAttribute('title') ?? '',
    type: el.getAttribute('type') ?? '',
    id: el.getAttribute('id') ?? '',
    name: el.getAttribute('name') ?? '',
  };
}

/** Call immediately before writing to `el`. */
export function guardFill(el: Element): GuardRefusal | null {
  return allowFill(fieldFacts(el), el.ownerDocument.location?.href ?? '');
}

/** Call immediately before clicking `el`. */
export function guardClick(el: Element): GuardRefusal | null {
  return allowClick(buttonFacts(el), el.ownerDocument.location?.href ?? '');
}
