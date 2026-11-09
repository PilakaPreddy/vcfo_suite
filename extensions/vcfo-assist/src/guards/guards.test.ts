import { describe, expect, it } from 'vitest';
import { allowClick, allowFill, isForbiddenAction, isForbiddenPage, isSecretField, words } from './index';
import { buttonFacts, fieldFacts, guardClick, guardFill } from './dom';

const PAGE = 'http://127.0.0.1:4318/spice-a.html';

describe('words', () => {
  it('splits camelCase, snake_case, kebab-case and digits', () => {
    expect(words('userId')).toBe('user id');
    expect(words('user_id')).toBe('user id');
    expect(words('captcha-input')).toBe('captcha input');
    expect(words('proposedName1')).toBe('proposed name 1');
  });
});

describe('isSecretField: G1 login and password', () => {
  it.each([
    [{ type: 'password', name: 'x' }, 'G1'],
    [{ name: 'pwd' }, 'G1'],
    [{ label: 'Pass word' }, 'G1'],
    [{ label: 'Password' }, 'G1'],
    [{ autocomplete: 'current-password' }, 'G1'],
    [{ name: 'userId' }, 'G1'],
    [{ label: 'User ID' }, 'G1'],
    [{ placeholder: 'Login ID' }, 'G1'],
    [{ aria: 'Username' }, 'G1'],
    [{ autocomplete: 'username', name: 'u' }, 'G1'],
    [{ label: 'Transaction PIN' }, 'G1'],
  ])('refuses %o', (facts, code) => {
    expect(isSecretField(facts)?.code).toBe(code);
  });
});

describe('isSecretField: G2 captcha in four disguises', () => {
  it('label "captcha"', () => expect(isSecretField({ label: 'Enter Captcha' })?.code).toBe('G2'));
  it('name="cap"', () => expect(isSecretField({ name: 'cap' })?.code).toBe('G2'));
  it('image next to a text box', () => expect(isSecretField({ name: 'code1', nearCaptchaImage: true })?.code).toBe('G2'));
  it('label "Enter the characters shown"', () =>
    expect(isSecretField({ label: 'Enter the characters shown above' })?.code).toBe('G2'));
});

describe('isSecretField: G3 OTP', () => {
  it('autocomplete one-time-code', () => expect(isSecretField({ autocomplete: 'one-time-code', name: 'c' })?.code).toBe('G3'));
  it('label "Enter OTP"', () => expect(isSecretField({ label: 'Enter OTP' })?.code).toBe('G3'));
  it('one time password', () => expect(isSecretField({ placeholder: 'One-time password' })?.code).toBe('G3'));
  it('six one-digit boxes', () =>
    expect(isSecretField({ name: 'd1', maxLength: 1, inSingleCharGroup: true, inputMode: 'numeric' })?.code).toBe('G3'));
});

describe('isSecretField: ordinary Part A fields pass', () => {
  it.each([
    { name: 'proposedName1', label: 'Proposed name 1' },
    { name: 'significance', label: 'Significance of the key word used in the proposed name' },
    { name: 'companyType', label: 'Type of company' },
    { name: 'pincode', label: 'PIN code' },
    { name: 'authorisedCapital', label: 'Authorised share capital' },
    { name: 'passportNumber', label: 'Passport number' },
    { name: 'secretaryName', label: 'Company secretary' },
  ])('allows %o', (facts) => {
    expect(isSecretField(facts)).toBeNull();
  });
});

describe('isForbiddenAction: G4, G5, G6', () => {
  it.each([
    [{ text: 'Submit' }, 'G4'],
    [{ text: 'Final Submit' }, 'G4'],
    [{ text: 'SUBMIT' }, 'G4'],
    [{ text: 'Proceed' }, 'G4'],
    [{ type: 'submit' }, 'G4'],
    [{ text: 'Proceed to Pay' }, 'G5'],
    [{ text: 'Pay Now' }, 'G5'],
    [{ text: 'Make Payment' }, 'G5'],
    [{ text: 'Pay fee' }, 'G5'],
    [{ text: 'Affix DSC' }, 'G6'],
    [{ text: 'Sign' }, 'G6'],
    [{ text: 'Login' }, 'G1'],
    [{ text: 'Save', id: 'btnSubmit' }, 'G4'],
    [{ value: 'Submit', type: 'submit' }, 'G4'],
    [{ aria: 'Pay the fee' }, 'G5'],
  ])('refuses %o', (facts, code) => {
    expect(isForbiddenAction(facts)?.code).toBe(code);
  });

  it.each([{ text: 'Save draft' }, { text: 'Check form' }, { text: 'Download PDF' }, { text: 'Save draft', type: 'submit' }])(
    'allows %o',
    (facts) => {
      expect(isForbiddenAction(facts)).toBeNull();
    },
  );
});

describe('isForbiddenPage', () => {
  it('refuses login and payment pages', () => {
    expect(isForbiddenPage('https://www.mca.gov.in/content/mca/global/en/foportal/fologin.html')?.code).toBe('G5');
    expect(isForbiddenPage('https://paygov.example/checkout')).not.toBeNull();
    expect(isForbiddenPage('https://netbanking.somebank.example/pay')).not.toBeNull();
  });
  it('allows the mock form page', () => {
    expect(isForbiddenPage(PAGE)).toBeNull();
  });
  it('allowFill and allowClick apply the page rule first', () => {
    expect(allowFill({ name: 'proposedName1' }, 'https://x.example/payment')?.code).toBe('G5');
    expect(allowClick({ text: 'Save draft' }, 'https://x.example/login')?.code).toBe('G5');
  });
});

describe('DOM facts (jsdom)', () => {
  function mount(html: string): HTMLElement {
    document.body.innerHTML = html;
    return document.body;
  }

  it('G1: a fake login page refuses user id and password and the Login button', () => {
    mount(`
      <div><label for="u">User ID</label><input id="u" name="u1"></div>
      <div><label for="p">Secret word</label><input id="p" type="password"></div>
      <button id="go">Login</button>`);
    expect(guardFill(document.getElementById('u')!)?.code).toBe('G1');
    expect(guardFill(document.getElementById('p')!)?.code).toBe('G1');
    expect(guardClick(document.getElementById('go')!)?.code).toBe('G1');
  });

  it('G2: a text box beside a captcha image is refused', () => {
    mount(`<div class="field"><img src="/captcha.jpg" alt="code"><input id="c" name="code1"></div>`);
    expect(fieldFacts(document.getElementById('c')!).nearCaptchaImage).toBe(true);
    expect(guardFill(document.getElementById('c')!)?.code).toBe('G2');
  });

  it('G3: six one-digit boxes are refused', () => {
    mount(`<div class="otp">${[1, 2, 3, 4, 5, 6].map((n) => `<input id="d${n}" maxlength="1" inputmode="numeric">`).join('')}</div>`);
    expect(guardFill(document.getElementById('d3')!)?.code).toBe('G3');
  });

  it('G4: a Submit button relabelled "Save draft" by a recipe is still refused by its own text', () => {
    mount(`<button id="btn-save">Submit</button>`);
    // The recipe would call this "Save draft"; the guard reads the element, not the recipe.
    expect(guardClick(document.getElementById('btn-save')!)?.code).toBe('G4');
    expect(buttonFacts(document.getElementById('btn-save')!).text).toBe('Submit');
  });

  it('allows an ordinary labelled field', () => {
    mount(`<div class="guideFieldNode"><label for="n1">Proposed name 1</label><input id="n1" name="proposedName1"></div>`);
    expect(guardFill(document.getElementById('n1')!)).toBeNull();
  });
});
