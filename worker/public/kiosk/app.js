(function () {
  'use strict';

  const messageEl = document.getElementById('message');
  const backBtn = document.getElementById('back');
  const fieldsEl = document.getElementById('fields');
  const buttonsEl = document.getElementById('buttons');
  const countdownEl = document.getElementById('countdown');

  // Secret from the kiosk link (lobbyapp.app/?kiosk=...) naming this iPad's facility.
  const kioskToken = new URLSearchParams(window.location.search).get('kiosk');

  // { facility, flow, clinicians } from the server; see worker/src/flow.js for the flow format.
  let data = null;
  let current = null;
  // Screens visited before this one, for Back. Cleared at the start and once someone is
  // notified, since going back then could send a second notice.
  let trail = [];
  // What this visitor typed on information screens, by field name. Kept only on the iPad,
  // and only until the kiosk returns to the start, so later screens can show it.
  let answers = {};
  let timer = null;

  function screens() {
    return data.flow.screens;
  }

  // Field names by lower case, so {first name} and {First Name} both match "First name".
  function fieldNames() {
    const names = {};
    screens().forEach(function (s) {
      (s.fields || []).forEach(function (f) { names[f.name.toLowerCase()] = f.name; });
    });
    return names;
  }

  // Swaps {Field name} in a message or button for what the visitor entered. Braces that
  // don't name a field are left as typed.
  function fill(text) {
    const names = fieldNames();
    return String(text || '').replace(/\{([^{}]+)\}/g, function (match, name) {
      const key = names[name.trim().toLowerCase()];
      return key ? (answers[key] || '') : match;
    });
  }

  function isHome() {
    return !current || current.id === screens()[0].id;
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      clearTimeout(timer);
      timer = null;
    }
  }

  // Screens with returnAfter count down back to the start. Any other screen past the
  // first goes back after a minute without a tap, so the next visitor starts fresh.
  function armTimer(screen) {
    clearTimer();
    countdownEl.textContent = '';
    if (screen.returnAfter > 0) {
      let remaining = screen.returnAfter;
      countdownEl.textContent = 'Returning to home in ' + remaining + ' seconds.';
      timer = setInterval(function () {
        remaining -= 1;
        countdownEl.textContent = 'Returning to home in ' + remaining + ' seconds.';
        if (remaining <= 0) goHome();
      }, 1000);
    } else if (!isHome()) {
      timer = setTimeout(goHome, CONFIG.idleReturnSeconds * 1000);
    }
  }

  function goHome() {
    show(screens()[0].id);
  }

  function go(id) {
    trail.push(current.id);
    show(id);
  }

  function goBack() {
    show(trail.pop());
  }

  function addButton(label, className, onTap) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', onTap);
    buttonsEl.appendChild(btn);
    return btn;
  }

  function notSetUp() {
    clearTimer();
    messageEl.textContent = 'This kiosk is not set up yet.';
    backBtn.hidden = true;
    fieldsEl.innerHTML = '';
    buttonsEl.innerHTML = '';
    countdownEl.textContent = '';
  }

  function show(id) {
    const screen = screens().find(function (s) { return s.id === id; }) || screens()[0];
    current = screen;
    if (isHome()) {
      trail = [];
      answers = {};
    }
    backBtn.hidden = !trail.length;

    const message = fill(screen.message);
    messageEl.textContent = message;
    messageEl.hidden = !message;

    fieldsEl.innerHTML = '';
    buttonsEl.innerHTML = '';
    if (screen.type === 'form') showForm(screen);
    else showButtons(screen);
    armTimer(screen);
  }

  function showForm(screen) {
    const inputs = screen.fields.map(function (f, i) {
      const id = 'field-' + i;
      const label = document.createElement('label');
      label.className = 'field-label';
      label.htmlFor = id;
      label.textContent = fill(f.label);
      if (f.required) {
        const req = document.createElement('span');
        req.className = 'required';
        req.textContent = ' (required)';
        label.appendChild(req);
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.id = id;
      input.className = 'kiosk-input';
      input.maxLength = 200;
      input.autocomplete = 'off';
      input.value = answers[f.name] || '';
      input.addEventListener('input', function () {
        answers[f.name] = input.value;
        update();
        if (!current.returnAfter) armTimer(current);
      });
      // Enter moves to the next box, and submits from the last one.
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (i < inputs.length - 1) inputs[i + 1].focus();
        else if (!submit.disabled) submit.click();
      });
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.appendChild(label);
      wrap.appendChild(input);
      fieldsEl.appendChild(wrap);
      return input;
    });

    const submit = addButton(fill(screen.submit.label), 'btn btn-primary', function () {
      if (!ready()) return;
      inputs.forEach(function (input) { input.blur(); });
      go(screen.submit.target);
    });
    function ready() {
      return screen.fields.every(function (f) { return !f.required || String(answers[f.name] || '').trim(); });
    }
    function update() {
      submit.disabled = !ready();
    }
    update();
  }

  function showButtons(screen) {
    const people = new Set(data.clinicians.map(function (c) { return c.id; }));
    screen.buttons.forEach(function (b) {
      if (b.action === 'home') {
        addButton(fill(b.label), 'btn btn-secondary', goHome);
      } else if (b.action === 'screen') {
        addButton(fill(b.label), 'btn btn-primary', function () { go(b.target); });
      } else if (b.action === 'notify' && people.has(b.person)) {
        // A button for someone since removed from the business is hidden.
        addButton(fill(b.label), 'btn btn-primary', function () { notify(b.person, b.target); });
      } else if (b.action === 'people') {
        data.clinicians.forEach(function (c) {
          addButton(c.name, 'btn btn-primary', function () { notify(c.id, b.target); });
        });
        if (!data.clinicians.length) {
          const msg = document.createElement('p');
          msg.className = 'instructions';
          msg.textContent = 'No one is listed yet.';
          buttonsEl.appendChild(msg);
        }
      }
    });
  }

  function notify(personId, then) {
    const sent = answers;
    trail = [];
    show(then);
    fetch(CONFIG.apiBaseUrl + '/api/kiosk/' + encodeURIComponent(kioskToken) + '/checkin', {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicianId: personId, answers: sent })
    }).catch(function () {});
  }

  // A visitor partway through keeps their screen; new screens show from the next start.
  function applyKioskData(next) {
    data = next;
    if (isHome()) goHome();
  }

  // The kiosk's screens and people come from the server and are refreshed
  // periodically, so edits show up without touching the iPad. The last good
  // copy is cached so a network blip at startup doesn't blank the kiosk.
  function loadKiosk() {
    const cacheKey = 'kiosk:' + kioskToken;
    fetch(CONFIG.apiBaseUrl + '/api/kiosk/' + encodeURIComponent(kioskToken), { mode: 'cors', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (next) {
        if (!next.ok) {
          data = null;
          notSetUp();
          return;
        }
        applyKioskData(next);
        try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch (e) {}
      })
      .catch(function () {
        if (data) return;
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch (e) {}
        if (cached && cached.flow) applyKioskData(cached);
      });
  }

  function init() {
    if (!kioskToken) {
      notSetUp();
      return;
    }
    loadKiosk();
    setInterval(loadKiosk, CONFIG.kioskRefreshMinutes * 60 * 1000);
    backBtn.addEventListener('click', goBack);
    // Any tap restarts the idle clock on screens without a countdown.
    document.addEventListener('pointerdown', function () {
      if (current && !current.returnAfter && !isHome()) armTimer(current);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
