// Screen editor: edits one kiosk's screens (/screens#<kiosk token>) and saves them
// with PUT /api/kiosks/:token. The flow format is described in worker/src/flow.js.

(function () {
  'use strict';

  var api = Lobby.api;
  var el = Lobby.el;
  var token = decodeURIComponent(window.location.hash.slice(1));
  var MAX_BUTTONS = 10;
  var MAX_FIELDS = 10;
  var MAX_RECIPIENTS = 10;
  // Tags every email can use; see worker/src/flow.js.
  var TAGS = ['person', 'time', 'kiosk', 'all answers'];

  var account = null;
  var kiosk = null;
  var flow = null;
  var dirty = false;
  // Red notices under buttons whose email uses tags that won't be filled in: [{ node, screen, button }].
  var warnings = [];

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

  function templateChoices() {
    return [{ value: '', text: 'Standard' }].concat(account.templates.map(function (t) {
      return { value: t.id, text: t.name };
    }));
  }

  function tagKey(name) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // For each screen, the field names a visitor has always filled in by the time they get
  // there, whichever way they came. The kiosk forgets answers at the start screen, and a
  // screen nobody can reach gets none.
  function collectedOnArrival() {
    var byId = {};
    flow.screens.forEach(function (s) { byId[s.id] = s; });
    var start = flow.screens[0].id;
    var arrival = {};
    arrival[start] = [];
    var changed = true;
    while (changed) {
      changed = false;
      flow.screens.forEach(function (s) {
        if (!arrival[s.id]) return;
        var known = arrival[s.id].concat((s.fields || []).map(function (f) { return tagKey(f.name); }));
        var next = s.type === 'form'
          ? [s.submit.target]
          : s.buttons.map(function (b) { return b.action === 'home' ? '' : b.target; });
        next.forEach(function (id) {
          if (!byId[id] || id === start) return;
          var before = arrival[id];
          var after = before ? before.filter(function (k) { return known.indexOf(k) !== -1; }) : known;
          if (!before || after.length !== before.length) {
            arrival[id] = after;
            changed = true;
          }
        });
      });
    }
    return arrival;
  }

  function refreshWarnings() {
    var arrival = collectedOnArrival();
    warnings.forEach(function (w) {
      var t = account.templates.find(function (x) { return x.id === w.button.template; });
      // A submit button also has its own screen's answers.
      var known = (arrival[w.screen.id] || []).concat((w.screen.fields || []).map(function (f) { return tagKey(f.name); }));
      var missing = [];
      if (t) {
        (t.subject + ' ' + t.body).replace(/\{([^{}]+)\}/g, function (match, name) {
          var key = tagKey(name);
          if (TAGS.indexOf(key) === -1 && known.indexOf(key) === -1 && missing.indexOf(match) === -1) missing.push(match);
          return match;
        });
      }
      w.node.hidden = !missing.length;
      w.node.textContent = missing.length
        ? 'The "' + t.name + '" email uses ' + missing.join(', ') + ', which ' + (missing.length > 1 ? 'aren\'t' : 'isn\'t') +
          ' always asked for before this button. Anything missing shows in the email as typed. ' +
          'Fix it by collecting it on an earlier screen or changing the template.'
        : '';
    });
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
    warnings = [];
    flow.screens.forEach(function (s, i) {
      screensEl.appendChild(screenCard(s, i));
    });
    refreshWarnings();
  }

  function screenCard(s, i) {
    var name = textInput(s.name, 40, 'Enter Screen ' + (i + 1) + ' title', function (v) { s.name = v; });
    // Other screens' menus show this title, so refresh them once editing is done.
    name.addEventListener('change', render);

    var head = el('div', { className: 'screen-head' }, [
      el('div', { className: 'screen-title' }, [
        field('Screen title', name, 'Only you see this. Buttons use it to say where they go.'),
        el('span', { className: 'tag tag-plain', text: s.type === 'form' ? 'Information screen' : 'Button screen' }),
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

    var body = [
      head,
      el('div', { className: 'message-row' }, [
        field('Message at the top', textInput(s.message, 200, 'e.g. Welcome! How can we help?', function (v) { s.message = v; })),
        field('Auto return to start screen', returnAfter, 'Seconds. 0 for none.')
      ])
    ];
    body = body.concat(s.type === 'form' ? formParts(s) : buttonParts(s));
    return el('section', { className: 'card panel screen-card', 'data-screen': s.id }, body);
  }

  // Focuses the last text box in a screen's list, after adding a row to it.
  function focusLast(s) {
    var inputs = screensEl.querySelectorAll('[data-screen="' + s.id + '"] .button-row input[type=text]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  // Move up / Move down / Remove for row j of list.
  function rowActions(list, j) {
    var up = smallButton('\u2191', 'btn-secondary', function () { move(list, j, -1); }, j === 0);
    var down = smallButton('\u2193', 'btn-secondary', function () { move(list, j, 1); }, j === list.length - 1);
    up.title = 'Move up';
    up.setAttribute('aria-label', 'Move up');
    down.title = 'Move down';
    down.setAttribute('aria-label', 'Move down');
    return el('div', { className: 'row-actions' }, [
      up, down,
      smallButton('Remove', 'btn-danger', function () { list.splice(j, 1); markDirty(); render(); })
    ]);
  }

  // Column headings over a list of rows. An invisible copy of the row buttons keeps
  // the headings lined up with the columns below.
  function listHead(columns, cols, single) {
    var spacer = single ? el('div') : rowActions([], 0);
    spacer.setAttribute('aria-hidden', 'true');
    spacer.className += ' spacer';
    return el('li', { className: 'list-head grid-row ' + cols }, columns.map(function (c) {
      return el('span', { text: c });
    }).concat([spacer]));
  }

  // Fills a column that doesn't apply to this row's action.
  function blank(text) {
    return el('span', { className: 'muted cell-note', text: text || '' });
  }

  function notifies(b) {
    return b.action === 'notify' || b.action === 'emails' || b.action === 'people';
  }

  function buttonParts(s) {
    // The Recipient and Email columns only appear on screens with a button that notifies.
    var wide = s.buttons.some(notifies);
    var cols = wide ? 'cols-buttons-wide' : 'cols-buttons';
    var list = el('ul', { className: 'list' });
    if (s.buttons.length) {
      list.appendChild(listHead(wide
        ? ['Button label', 'Action', 'Recipient', 'Email', 'Next screen']
        : ['Button label', 'Action', 'Next screen'], cols));
    }
    s.buttons.forEach(function (b, j) { list.appendChild(buttonRow(s, b, j, wide, cols)); });
    if (!s.buttons.length) {
      list.appendChild(el('li', { className: 'empty', text: 'No buttons. Visitors just read the message, so set an auto return to send the kiosk back to the start.' }));
    }
    return [
      el('label', { text: 'Buttons' }),
      list,
      smallButton('Add a button', 'btn-secondary', function () {
        s.buttons.push({ label: '', action: 'screen', target: '' });
        markDirty();
        render();
        focusLast(s);
      }, s.buttons.length >= MAX_BUTTONS)
    ];
  }

  function formParts(s) {
    var list = el('ul', { className: 'list' });
    if (s.fields.length) list.appendChild(listHead(['Prompt the visitor sees', 'Tag', 'Required?'], 'cols-fields'));
    s.fields.forEach(function (f, j) { list.appendChild(fieldRow(s, f, j)); });
    if (!s.fields.length) {
      list.appendChild(el('li', { className: 'empty', text: 'No entry fields yet. Add the first one below.' }));
    }
    return [
      el('label', { text: 'Entry fields' }),
      list,
      smallButton('Add an entry field', 'btn-secondary', function () {
        s.fields.push({ label: '', name: '', required: false });
        markDirty();
        render();
        focusLast(s);
      }, s.fields.length >= MAX_FIELDS),
      el('p', { className: 'hint', text: 'Example: the prompt "Please enter your first name" with the tag "First name". To show an answer on a later screen, put its tag in braces in a message or button, like {First name}. {Person} shows the name of whoever the visitor notified. Email templates on the dashboard use the same tags. Answers go only in the email and are never stored.' }),
      el('label', { text: 'Submit button', style: 'margin-top: 14px' }),
      submitList(s),
      el('p', { className: 'hint', text: 'Visitors can tap it once every required field is filled in. It can do anything another button can, except list all your people.' })
    ];
  }

  // An information screen's submit button, laid out like a row of buttons.
  function submitList(s) {
    var wide = notifies(s.submit);
    var cols = wide ? 'cols-buttons-wide' : 'cols-buttons';
    return el('ul', { className: 'list' }, [
      listHead(wide
        ? ['Button label', 'Action', 'Recipient', 'Email', 'Next screen']
        : ['Button label', 'Action', 'Next screen'], cols, true),
      buttonRow(s, s.submit, 0, wide, cols, true)
    ]);
  }

  function fieldRow(s, f, j) {
    var prompt = textInput(f.label, 120, 'e.g. Please enter your first name', function (v) { f.label = v; });
    prompt.setAttribute('aria-label', 'Prompt the visitor sees');
    var name = textInput(f.name, 30, 'e.g. First name', function (v) { f.name = v; refreshWarnings(); });
    name.setAttribute('aria-label', 'Tag');
    var required = el('input', { type: 'checkbox', 'aria-label': 'Required' });
    required.checked = !!f.required;
    required.addEventListener('change', function () { f.required = required.checked; markDirty(); });

    return el('li', { className: 'button-row grid-row cols-fields' }, [
      prompt, name, el('label', { className: 'cell-check' }, [required, el('span', { className: 'narrow-only', text: 'Required' })]), rowActions(s.fields, j)
    ]);
  }

  // A button's row; isSubmit for an information screen's submit button, which can't
  // list all people and isn't moved or removed.
  function buttonRow(s, b, j, wide, cols, isSubmit) {
    var actions = [
      { value: 'screen', text: 'Go to a screen' },
      { value: 'notify', text: 'E-mail' },
      { value: 'emails', text: 'Multiple E-mails' },
      { value: 'home', text: 'Back to start' },
      { value: 'people', text: 'List all people' }
    ];
    var action = select(isSubmit ? actions.slice(0, -1) : actions, b.action, 'Choose what it does…', function (v) {
      // Switching from E-mail keeps its recipient as the first of the list.
      if (v === 'emails' && !b.persons) b.persons = b.person ? [b.person] : [];
      b.action = v;
    });
    action.setAttribute('aria-label', 'Action');

    // A People-list entry becomes one button per person, named for them, so it has no text of its own.
    var label;
    if (b.action === 'people') {
      label = blank('Each person\'s name');
    } else {
      label = textInput(b.label, 60, isSubmit ? 'Continue' : 'Button text', function (v) { b.label = v; });
      label.setAttribute('aria-label', 'Button label');
    }
    var cells = [label, action];

    var warning = null;
    if (wide) {
      var recipient = blank();
      var email = blank();
      if (b.action === 'notify') {
        recipient = select(personChoices(), b.person, account.clinicians.length ? 'Choose a person…' : 'Add people on the dashboard first', function (v) { b.person = v; });
        recipient.setAttribute('aria-label', 'Recipient');
      } else if (b.action === 'emails') {
        var count = (b.persons || []).length;
        recipient = blank(count ? count + (count > 1 ? ' people, below' : ' person, below') : 'Add them below');
      } else if (b.action === 'people') {
        recipient = blank('The person tapped');
      }
      if (notifies(b)) {
        email = select(templateChoices(), b.template || '', 'Choose an email…', function (v) {
          if (v) b.template = v;
          else delete b.template;
        });
        email.setAttribute('aria-label', 'Email');
        warning = el('div', { className: 'notice notice-error' });
        warnings.push({ node: warning, screen: s, button: b });
      }
      cells.push(recipient, email);
    }

    var next = blank(b.action === 'home' ? 'Start screen' : '');
    if (b.action === 'screen' || notifies(b)) {
      next = select(screenChoices(), b.target, 'Choose a screen…', function (v) { b.target = v; });
      next.setAttribute('aria-label', 'Next screen');
    }
    cells.push(next, isSubmit ? el('div') : rowActions(s.buttons, j), b.action === 'emails' ? recipientList(b) : null, warning);

    return el('li', { className: 'button-row grid-row ' + cols }, cells);
  }

  // The people a Multiple E-mails button emails: an "Add recipient" menu, then each name with an x.
  function recipientList(b) {
    b.persons = b.persons || [];
    var add = el('select', { className: 'btn btn-secondary btn-small add-recipient', 'aria-label': 'Add recipient' });
    add.appendChild(el('option', { value: '', text: '+ Add recipient' }));
    account.clinicians.forEach(function (c) {
      if (b.persons.indexOf(c.id) === -1) add.appendChild(el('option', { value: c.id, text: c.name }));
    });
    add.disabled = add.options.length === 1 || b.persons.length >= MAX_RECIPIENTS;
    add.addEventListener('change', function () {
      if (!add.value) return;
      b.persons.push(add.value);
      markDirty();
      render();
    });

    var chips = b.persons.map(function (id, k) {
      var c = account.clinicians.find(function (x) { return x.id === id; });
      var name = c ? c.name : 'Someone no longer listed';
      var x = el('button', { type: 'button', className: 'chip-x', text: '\u00d7', title: 'Remove ' + name, 'aria-label': 'Remove ' + name });
      x.addEventListener('click', function () {
        b.persons.splice(k, 1);
        markDirty();
        render();
      });
      return el('span', { className: 'chip' + (c ? '' : ' chip-missing') }, [el('span', { text: name }), x]);
    });
    return el('div', { className: 'recipients' }, [add].concat(chips));
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
      document.querySelectorAll('.panel, .add-screens, .save-bar, #open-kiosk').forEach(function (n) { n.hidden = true; });
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

  function addScreen(s) {
    flow.screens.push(s);
    markDirty();
    render();
    screensEl.lastChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
    screensEl.lastChild.querySelector('input').focus({ preventScroll: true });
  }

  document.getElementById('add-buttons-screen').addEventListener('click', function () {
    addScreen({ id: newId(), name: '', type: 'buttons', message: '', returnAfter: 0, buttons: [] });
  });

  document.getElementById('add-form-screen').addEventListener('click', function () {
    addScreen({
      id: newId(), name: '', type: 'form', message: '', returnAfter: 0,
      fields: [{ label: '', name: '', required: true }],
      submit: { label: 'Continue', action: 'screen', target: '' }
    });
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
