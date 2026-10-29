// Screen editor: edits one kiosk's screens (/screens#<kiosk token>) and saves them
// with PUT /api/kiosks/:token. The flow format is described in worker/src/flow.js.

(function () {
  'use strict';

  var api = Lobby.api;
  var el = Lobby.el;
  var token = decodeURIComponent(window.location.hash.slice(1));
  var MAX_BUTTONS = 10;

  var account = null;
  var kiosk = null;
  var flow = null;
  var dirty = false;

  var screensEl = document.getElementById('screens');
  var labelInput = document.getElementById('kiosk-label');

  function pageNotice(text, kind) {
    Lobby.showNotice(document.getElementById('page-notice'), text, kind);
  }

  function markDirty() {
    dirty = true;
    document.getElementById('dirty').textContent = 'Unsaved changes';
    Lobby.showNotice(document.getElementById('save-notice'), '');
  }

  function newId() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var id = 's';
    for (var i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function move(list, i, by) {
    var j = i + by;
    if (j < 0 || j >= list.length) return;
    var item = list.splice(i, 1)[0];
    list.splice(j, 0, item);
    markDirty();
    render();
  }

  // A <select>; a value no longer among the choices shows as "Choose…" so saving asks for one.
  function select(choices, value, placeholder, onChange) {
    var node = el('select', {});
    var known = choices.some(function (c) { return c.value === value; });
    if (!known) node.appendChild(el('option', { value: '', text: placeholder }));
    choices.forEach(function (c) {
      var option = el('option', { value: c.value, text: c.text });
      if (c.value === value) option.selected = true;
      node.appendChild(option);
    });
    node.addEventListener('change', function () {
      onChange(node.value);
      markDirty();
      render();
    });
    return node;
  }

  function screenChoices() {
    return flow.screens.map(function (s, i) {
      return { value: s.id, text: s.name || 'Screen ' + (i + 1) };
    });
  }

  function personChoices() {
    return account.clinicians.map(function (c) { return { value: c.id, text: c.name }; });
  }

  function field(labelText, control, hint) {
    var id = 'f' + newId();
    control.id = id;
    return el('div', { className: 'field' }, [
      el('label', { for: id, text: labelText }), control, hint ? el('p', { className: 'hint', text: hint }) : null
    ]);
  }

  function textInput(value, max, placeholder, onInput) {
    var node = el('input', { type: 'text', maxlength: String(max), placeholder: placeholder || '' });
    node.value = value || '';
    node.addEventListener('input', function () { onInput(node.value); markDirty(); });
    return node;
  }

  function smallButton(text, className, onClick, disabled) {
    var node = el('button', { type: 'button', className: 'btn btn-small ' + className, text: text });
    if (disabled) node.disabled = true;
    node.addEventListener('click', onClick);
    return node;
  }

  function render() {
    screensEl.innerHTML = '';
    flow.screens.forEach(function (s, i) {
      screensEl.appendChild(screenCard(s, i));
    });
  }

  function screenCard(s, i) {
    var name = textInput(s.name, 40, 'Enter Screen ' + (i + 1) + ' title', function (v) { s.name = v; });
    // Other screens' menus show this title, so refresh them once editing is done.
    name.addEventListener('change', render);

    var head = el('div', { className: 'screen-head' }, [
      el('div', { className: 'screen-title' }, [
        field('Screen title', name, 'Only you see this. Buttons use it to say where they go.'),
        i === 0 ? el('span', { className: 'tag', text: 'Start screen' }) : null
      ]),
      el('div', { className: 'row-actions' }, [
        smallButton('Up', 'btn-secondary', function () { move(flow.screens, i, -1); }, i === 0),
        smallButton('Down', 'btn-secondary', function () { move(flow.screens, i, 1); }, i === flow.screens.length - 1),
        smallButton('Delete', 'btn-danger', function () {
          if (!window.confirm('Delete the "' + (s.name || 'Screen ' + (i + 1)) + '" screen?')) return;
          flow.screens.splice(i, 1);
          markDirty();
          render();
        }, flow.screens.length === 1)
      ])
    ]);

    var returnAfter = el('input', { type: 'number', min: '0', max: '120', step: '1', inputmode: 'numeric' });
    returnAfter.value = String(s.returnAfter || 0);
    returnAfter.addEventListener('input', function () { s.returnAfter = Number(returnAfter.value) || 0; markDirty(); });

    var phone = el('input', { type: 'checkbox' });
    phone.checked = !!s.showPhone;
    phone.addEventListener('change', function () { s.showPhone = phone.checked; markDirty(); });
    var phoneHint = account.facility.officePhone ? null : el('span', { className: 'muted', text: ' (set your office phone on the dashboard first)' });

    var body = [
      head,
      field('Message at the top', textInput(s.message, 200, 'e.g. Welcome! How can we help?', function (v) { s.message = v; })),
      el('div', { className: 'form-row' }, [
        field('Count down back to the start after', returnAfter, 'Seconds. 0 for no countdown.'),
        el('div', { className: 'field' }, [
          el('label', { className: 'check' }, [phone, document.createTextNode('Show the office phone number'), phoneHint])
        ])
      ])
    ];

    var list = el('ul', { className: 'list' });
    s.buttons.forEach(function (b, j) { list.appendChild(buttonRow(s, b, j)); });
    if (!s.buttons.length) {
      list.appendChild(el('li', { className: 'empty', text: 'No buttons. Visitors just read the message, so add a countdown to send the kiosk back to the start.' }));
    }
    body.push(el('label', { text: 'Buttons' }));
    body.push(list);
    body.push(smallButton('Add a button', 'btn-secondary', function () {
      s.buttons.push({ label: '', action: 'screen', target: '' });
      markDirty();
      render();
      var inputs = screensEl.querySelectorAll('[data-screen="' + s.id + '"] .button-row input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, s.buttons.length >= MAX_BUTTONS));

    var card = el('section', { className: 'card panel screen-card', 'data-screen': s.id }, body);
    return card;
  }

  function buttonRow(s, b, j) {
    var label = textInput(b.label, 60, 'Button text', function (v) { b.label = v; });
    label.setAttribute('aria-label', 'Button text');
    var action = select([
      { value: 'screen', text: 'Goes to a screen' },
      { value: 'notify', text: 'Notifies a person' },
      { value: 'home', text: 'Goes back to the start' },
      { value: 'people', text: 'Lists all your people' }
    ], b.action, 'Choose what it does…', function (v) { b.action = v; });
    action.setAttribute('aria-label', 'What the button does');

    // A People-list entry becomes one button per person, named for them, so it has no text of its own.
    var parts = b.action === 'people'
      ? [el('span', { className: 'muted', text: 'A button for each person. Tapping one emails them.' }), action]
      : [label, action];
    if (b.action === 'notify') {
      var person = select(personChoices(), b.person, account.clinicians.length ? 'Choose a person…' : 'Add people on the dashboard first', function (v) { b.person = v; });
      person.setAttribute('aria-label', 'Person to notify');
      parts.push(person);
    }
    if (b.action === 'screen' || b.action === 'notify' || b.action === 'people') {
      var then = b.action !== 'screen';
      var target = select(screenChoices(), b.target, then ? 'Then show…' : 'Choose a screen…', function (v) { b.target = v; });
      target.setAttribute('aria-label', then ? 'Screen to show after notifying' : 'Screen to go to');
      parts.push(target);
    }

    return el('li', { className: 'button-row' }, [
      el('div', { className: 'button-fields' }, parts),
      el('div', { className: 'row-actions' }, [
        smallButton('Up', 'btn-secondary', function () { move(s.buttons, j, -1); }, j === 0),
        smallButton('Down', 'btn-secondary', function () { move(s.buttons, j, 1); }, j === s.buttons.length - 1),
        smallButton('Remove', 'btn-danger', function () { s.buttons.splice(j, 1); markDirty(); render(); })
      ])
    ]);
  }

  function setUpCopy() {
    var others = account.kiosks.filter(function (k) { return k.token !== kiosk.token; });
    var from = document.getElementById('copy-from');
    if (!others.length) {
      document.getElementById('copy-field').hidden = true;
      return;
    }
    others.forEach(function (k) { from.appendChild(el('option', { value: k.token, text: k.label })); });
    document.getElementById('copy').addEventListener('click', function () {
      var other = others.find(function (k) { return k.token === from.value; });
      if (!other || !window.confirm('Replace these screens with a copy of "' + other.label + '"? Nothing is saved until you click Save.')) return;
      flow = clone(other.flow);
      markDirty();
      render();
    });
  }

  function save(body, message) {
    var button = document.getElementById('save');
    var notice = document.getElementById('save-notice');
    button.disabled = true;
    return api('PUT', '/api/kiosks/' + encodeURIComponent(kiosk.token), body).then(function (r) {
      button.disabled = false;
      if (r.status === 401) {
        Lobby.showNotice(notice, 'You were signed out. Sign in again in another tab, then click Save.');
        return false;
      }
      if (!r.data.ok) {
        Lobby.showNotice(notice, r.data.error || 'Could not save. Please try again.');
        return false;
      }
      dirty = false;
      document.getElementById('dirty').textContent = '';
      Lobby.showNotice(notice, message, 'ok');
      return true;
    });
  }

  function start() {
    document.getElementById('editor').hidden = false;
    kiosk = account.kiosks.find(function (k) { return k.token === token; });
    if (!kiosk) {
      pageNotice('That kiosk was not found. Go back to the dashboard and choose Edit screens on a kiosk.');
      document.querySelectorAll('.panel, #add-screen, .save-bar, #open-kiosk').forEach(function (n) { n.hidden = true; });
      return;
    }
    flow = clone(kiosk.flow);
    document.title = 'Screens for ' + kiosk.label + ' – LobbyApp';
    document.getElementById('title').textContent = 'Screens for ' + kiosk.label;
    var open = document.getElementById('open-kiosk');
    open.href = kiosk.link;
    open.title = 'Taps on the opened kiosk send real notices.';
    labelInput.value = kiosk.label;
    labelInput.addEventListener('input', markDirty);
    setUpCopy();
    render();
  }

  document.getElementById('add-screen').addEventListener('click', function () {
    var s = { id: newId(), name: '', message: '', showPhone: false, returnAfter: 0, buttons: [] };
    flow.screens.push(s);
    markDirty();
    render();
    screensEl.lastChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
    screensEl.lastChild.querySelector('input').focus({ preventScroll: true });
  });

  document.getElementById('save').addEventListener('click', function () {
    save({ label: labelInput.value, flow: flow }, 'Saved. The kiosk picks up changes within a few minutes.');
  });

  document.getElementById('reset').addEventListener('click', function () {
    if (!window.confirm('Replace all of this kiosk\'s screens with the default ones? This saves right away.')) return;
    save({ label: labelInput.value, flow: null }, 'Reset to the default screens.').then(function (ok) {
      if (!ok) return;
      return api('GET', '/api/account').then(function (r) {
        account = r.data;
        kiosk = account.kiosks.find(function (k) { return k.token === token; });
        flow = clone(kiosk.flow);
        render();
      });
    });
  });

  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  api('GET', '/api/account').then(function (r) {
    if (r.status === 401) {
      window.location.href = '/signin';
      return;
    }
    document.getElementById('editor').hidden = false;
    if (!r.data.ok || !r.data.facility) {
      pageNotice(r.data.error || 'Could not load your account.');
      return;
    }
    account = r.data;
    start();
  });
})();
