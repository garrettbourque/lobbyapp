// Dashboard: loads the signed-in owner's business and lets them edit it.

(function () {
  'use strict';

  var api = Lobby.api;
  var el = Lobby.el;
  var state = null;

  var STATUS_TEXT = {
    sent: 'Emailed',
    no_email: 'No email set, alert sent',
    failed: 'Email failed, alert sent',
    rate_limited: 'Skipped (repeat tap)'
  };

  var TZ_NAMES = {
    'America/New_York': 'Eastern',
    'America/Chicago': 'Central',
    'America/Denver': 'Mountain',
    'America/Phoenix': 'Arizona',
    'America/Los_Angeles': 'Pacific',
    'America/Anchorage': 'Alaska',
    'Pacific/Honolulu': 'Hawaii'
  };

  function pageNotice(text, kind) {
    Lobby.showNotice(document.getElementById('page-notice'), text, kind);
  }

  function load() {
    return api('GET', '/api/account').then(function (r) {
      if (r.status === 401) {
        window.location.href = '/signin';
        return;
      }
      if (!r.data.ok) {
        document.getElementById('dash').hidden = false;
        pageNotice(r.data.error || 'Could not load your account.');
        return;
      }
      state = r.data;
      render();
    });
  }

  function render() {
    document.getElementById('dash').hidden = false;
    document.getElementById('who').textContent = state.user.email;
    if (!state.facility) {
      document.getElementById('business-title').textContent = 'Your account';
      pageNotice('There is no business on this account yet. Please contact us.', 'warn');
      return;
    }
    document.title = state.facility.name + ' – LobbyApp';
    document.getElementById('business-title').textContent = state.facility.name;
    renderClinicians();
    renderKiosks();
    renderFacility();
    renderCheckins();
  }

  function renderClinicians() {
    var list = document.getElementById('clinicians');
    list.innerHTML = '';
    if (!state.clinicians.length) {
      list.appendChild(el('li', { className: 'empty', text: 'No one yet. Add the first person below.' }));
      return;
    }
    state.clinicians.forEach(function (c) {
      list.appendChild(clinicianRow(c));
    });
  }

  function clinicianRow(c) {
    var edit = el('button', { type: 'button', className: 'btn btn-secondary btn-small', text: 'Edit' });
    var remove = el('button', { type: 'button', className: 'btn btn-danger btn-small', text: 'Remove' });
    var row = el('li', {}, [
      el('div', { className: 'who' }, [
        el('strong', { text: c.name }),
        el('span', { text: c.email || 'No email yet (check-ins alert your alert email)' })
      ]),
      el('div', { className: 'row-actions' }, [edit, remove])
    ]);

    edit.addEventListener('click', function () {
      row.replaceWith(clinicianEditRow(c));
    });
    remove.addEventListener('click', function () {
      if (!window.confirm('Remove ' + c.name + ' from the kiosk?')) return;
      remove.disabled = true;
      api('DELETE', '/api/clinicians/' + encodeURIComponent(c.id)).then(function (r) {
        if (!r.data.ok) {
          remove.disabled = false;
          pageNotice(r.data.error);
          return;
        }
        load();
      });
    });
    return row;
  }

  function clinicianEditRow(c) {
    var name = el('input', { type: 'text', name: 'name', maxlength: '60', 'aria-label': 'Name' });
    name.value = c.name;
    var email = el('input', { type: 'email', name: 'email', 'aria-label': 'Email', placeholder: 'Email' });
    email.value = c.email;
    var save = el('button', { type: 'submit', className: 'btn btn-small', text: 'Save' });
    var cancel = el('button', { type: 'button', className: 'btn btn-secondary btn-small', text: 'Cancel' });
    var notice = el('div', { className: 'notice', style: 'grid-column: 1 / -1; margin: 0' });
    var form = el('form', { novalidate: '' }, [
      name, email, el('div', { className: 'row-actions' }, [save, cancel]), notice
    ]);
    var row = el('li', {}, [form]);

    cancel.addEventListener('click', function () { row.replaceWith(clinicianRow(c)); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      save.disabled = true;
      api('PUT', '/api/clinicians/' + encodeURIComponent(c.id), {
        name: name.value, email: email.value, sortOrder: c.sortOrder
      }).then(function (r) {
        save.disabled = false;
        if (!r.data.ok) {
          Lobby.showNotice(notice, r.data.error);
          return;
        }
        load();
      });
    });
    setTimeout(function () { name.focus(); }, 0);
    return row;
  }

  function renderKiosks() {
    var list = document.getElementById('kiosks');
    list.innerHTML = '';
    if (!state.kiosks.length) {
      list.appendChild(el('li', { className: 'empty', text: 'No kiosks yet. Create a link for your iPad below.' }));
      return;
    }
    state.kiosks.forEach(function (k) {
      list.appendChild(kioskRow(k));
    });
  }

  function kioskRow(k) {
    var input = el('input', { type: 'text', readonly: '', 'aria-label': 'Kiosk link for ' + k.label });
    input.value = k.link;
    var copy = el('button', { type: 'button', className: 'btn btn-secondary btn-small', text: 'Copy' });
    var screens = el('a', { className: 'btn btn-secondary btn-small', href: '/screens#' + k.token, text: 'Edit screens' });
    var remove = el('button', { type: 'button', className: 'btn btn-danger btn-small', text: 'Remove' });

    copy.addEventListener('click', function () {
      input.select();
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(k.link).then(done, function () { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    remove.addEventListener('click', function () {
      if (!window.confirm('Remove "' + k.label + '"? Its link will stop working on that iPad.')) return;
      remove.disabled = true;
      api('DELETE', '/api/kiosks/' + encodeURIComponent(k.token)).then(function (r) {
        if (!r.data.ok) {
          remove.disabled = false;
          pageNotice(r.data.error);
          return;
        }
        load();
      });
    });

    return el('li', {}, [
      el('div', { className: 'who', style: 'flex: 1' }, [
        el('strong', { text: k.label }),
        el('span', { text: (k.customized ? 'Custom screens. ' : 'Default screens. ') + 'Starts with: ' + (k.flow.screens[0].message || '(no message)') }),
        el('div', { className: 'link-box' }, [input, copy])
      ]),
      el('div', { className: 'row-actions' }, [screens, remove])
    ]);
  }

  function renderFacility() {
    var f = state.facility;
    var form = document.getElementById('facility');
    form.elements.name.value = f.name;
    form.elements.officePhone.value = f.officePhone;
    form.elements.adminEmail.value = f.adminEmail;
    var select = form.elements.timezone;
    select.innerHTML = '';
    state.timezones.forEach(function (tz) {
      var option = el('option', { value: tz, text: (TZ_NAMES[tz] || tz) + ' (' + tz + ')' });
      if (tz === f.timezone) option.selected = true;
      select.appendChild(option);
    });
  }

  function renderCheckins() {
    var body = document.getElementById('checkins');
    body.innerHTML = '';
    if (!state.checkins.length) {
      body.appendChild(el('tr', {}, [el('td', { colspan: '3', className: 'muted', text: 'No check-ins yet.' })]));
      return;
    }
    state.checkins.forEach(function (c) {
      var when = new Date(c.at.replace(' ', 'T') + 'Z').toLocaleString('en-US', {
        timeZone: state.facility.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      body.appendChild(el('tr', {}, [
        el('td', { text: when }),
        el('td', { text: c.clinician }),
        el('td', {}, [el('span', { className: 'status status-' + c.status, text: STATUS_TEXT[c.status] || c.status })])
      ]));
    });
  }

  Lobby.bindForm(document.getElementById('add-clinician'), 'POST', '/api/clinicians', function (data, form) {
    form.reset();
    load().then(function () { document.getElementById('new-name').focus(); });
  });

  Lobby.bindForm(document.getElementById('add-kiosk'), 'POST', '/api/kiosks', function (data, form) {
    form.reset();
    load();
  });

  Lobby.bindForm(document.getElementById('facility'), 'PUT', '/api/facility', function (data, form) {
    Lobby.showNotice(form.querySelector('.notice'), 'Saved. Kiosks pick up changes within a few minutes.', 'ok');
    load();
  });

  document.getElementById('signout').addEventListener('click', function () {
    api('POST', '/api/signout').then(function () { window.location.href = '/'; });
  });

  load();
})();
