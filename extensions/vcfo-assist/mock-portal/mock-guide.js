/* MOCK PORTAL — a stand-in for an AEM Adaptive Form, for testing VCFO Assist only.
 * It is not a government site and calls no government endpoint. It provides:
 *   - window.guideBridge with resolveNode(som), setProperty(somList, prop, values), validate(errors, som)
 *     and visit(cb), built from the [data-som] boxes on the page;
 *   - Save draft, Check form, Download PDF, an Attach signed PDF slot, SUBMIT and Pay fee;
 *   - after SUBMIT and Pay it shows "SRN AB1234567".
 * window.__mock records every button click and model write so tests can prove what happened.
 */
(function () {
  'use strict';
  var mock = (window.__mock = { clicks: {}, modelWrites: [], domEvents: [], checkPassed: false, submitted: false, paid: false });
  var REQUIRED = ['proposedName1', 'companyType', 'companyClass', 'companyCategory', 'companySubCategory', 'mainDivision'];

  function $(sel) { return document.querySelector(sel); }
  function status(text) { $('#form-status').textContent = text; }
  function control(box) { return box.querySelector('input, select, textarea'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function labelOf(box) { var l = box.querySelector('.guideFieldLabel, label, legend'); return l ? l.textContent.trim() : ''; }

  function makeNode(box) {
    var el = control(box);
    var kind = el.tagName === 'SELECT' ? 'guideDropDownList' : el.tagName === 'TEXTAREA' ? 'guideTextArea' : el.type === 'radio' ? 'guideRadioButton' : 'guideTextBox';
    var node = {
      somExpression: box.getAttribute('data-som'),
      name: el.name,
      title: labelOf(box),
      className: kind,
      get value() {
        if (kind === 'guideRadioButton') { var c = box.querySelector('input:checked'); return c ? c.value : null; }
        return el.value;
      },
      set value(v) {
        mock.modelWrites.push(el.name);
        if (kind === 'guideDropDownList') {
          var opts = Array.prototype.slice.call(el.options);
          var hit = opts.find(function (o) { return norm(o.text) === norm(v) || o.value === v; }) ||
            opts.find(function (o) { return norm(o.text).indexOf(norm(v) + ' ') === 0; });
          if (hit) el.value = hit.value;
        } else if (kind === 'guideRadioButton') {
          box.querySelectorAll('input').forEach(function (r) { r.checked = norm(r.value) === norm(v); });
        } else {
          el.value = v;
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
    };
    return node;
  }

  var nodes = Array.prototype.map.call(document.querySelectorAll('[data-som]'), makeNode);

  window.guideBridge = {
    isConnected: function () { return true; },
    resolveNode: function (som) { return nodes.find(function (n) { return n.somExpression === som; }) || null; },
    setProperty: function (somList, prop, values) {
      somList.forEach(function (som, i) { var n = this.resolveNode(som); if (n && prop === 'value') n.value = values[i]; }, this);
    },
    validate: function (errors) {
      var missing = nodes.filter(function (n) { return REQUIRED.indexOf(n.name) >= 0 && !n.value; });
      if (Array.isArray(errors)) missing.forEach(function (n) { errors.push({ som: n.somExpression, errorText: n.title + ' is required' }); });
      return missing.length === 0;
    },
    visit: function (cb) { nodes.forEach(cb); },
  };

  // Ordinary DOM listeners, as a real form has: they prove the fallback's events arrive.
  document.querySelectorAll('[data-som] input, [data-som] select, [data-som] textarea').forEach(function (el) {
    ['input', 'change'].forEach(function (t) { el.addEventListener(t, function () { mock.domEvents.push(t + ':' + el.name); }); });
  });

  function count(id) { mock.clicks[id] = (mock.clicks[id] || 0) + 1; }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (b && b.id) count(b.id);
  }, true);

  $('#btn-login').addEventListener('click', function () {
    var ok = ['#login-user', '#login-password', '#login-captcha', '#login-otp'].every(function (s) { return $(s).value; });
    if (!ok) { $('#login-status').textContent = 'Fill user ID, password, captcha and OTP yourself.'; return; }
    $('#login-strip').hidden = true;
    $('#logged-in').hidden = false;
  });

  $('#btn-save').addEventListener('click', function () { status('Draft saved (mock).'); });

  $('#btn-check').addEventListener('click', function () {
    var errors = [];
    mock.checkPassed = window.guideBridge.validate(errors);
    status(mock.checkPassed ? 'Form check passed (mock).' : 'Errors: ' + errors.map(function (e) { return e.errorText; }).join('; '));
  });

  $('#btn-download').addEventListener('click', function () {
    if (!mock.checkPassed) { status('Errors: run Check form first.'); return; }
    var blob = new Blob(['%PDF-1.4\n% MOCK SPICe+ Part A, not a real form\n'], { type: 'application/pdf' });
    var a = $('#pdf-link');
    a.href = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '#';
    a.hidden = false;
    status('PDF ready (mock). Sign it with your DSC, then attach it.');
  });

  $('#signed-pdf').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0];
    $('#attach-status').textContent = f ? 'Attached: ' + f.name + ' (' + f.size + ' bytes)' : 'Nothing attached.';
  });

  $('#btn-submit').addEventListener('click', function () {
    if (!mock.checkPassed || !$('#signed-pdf').files.length) { status('Errors: check the form and attach the signed PDF before you submit.'); return; }
    mock.submitted = true;
    status('Submitted (mock). Pay the fee to get the SRN.');
  });

  $('#btn-pay').addEventListener('click', function () {
    if (!mock.submitted) { status('Errors: submit the form first.'); return; }
    mock.paid = true;
    $('#srn-box').hidden = false;
    $('#srn-box').textContent = 'Payment received (mock). SRN AB1234567 has been generated for this form.';
    status('Done (mock).');
  });
})();
