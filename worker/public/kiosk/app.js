(function () {
  'use strict';

  const messageEl = document.getElementById('message');
  const backBtn = document.getElementById('back');
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
  let timer = null;

  function screens() {
    return data.flow.screens;
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
  }

  function notSetUp() {
    clearTimer();
    messageEl.textContent = 'This kiosk is not set up yet.';
    backBtn.hidden = true;
    buttonsEl.innerHTML = '';
    countdownEl.textContent = '';
  }

  function show(id) {
    const screen = screens().find(function (s) { return s.id === id; }) || screens()[0];
    current = screen;
    if (isHome()) trail = [];
    backBtn.hidden = !trail.length;

    messageEl.textContent = screen.message;
    messageEl.hidden = !screen.message;

    buttonsEl.innerHTML = '';
    const people = new Set(data.clinicians.map(function (c) { return c.id; }));
    screen.buttons.forEach(function (b) {
      if (b.action === 'home') {
        addButton(b.label, 'btn btn-secondary', goHome);
      } else if (b.action === 'screen') {
        addButton(b.label, 'btn btn-primary', function () { go(b.target); });
      } else if (b.action === 'notify' && people.has(b.person)) {
        // A button for someone since removed from the business is hidden.
        addButton(b.label, 'btn btn-primary', function () { notify(b.person, b.target); });
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
    armTimer(screen);
  }

  function notify(personId, then) {
    trail = [];
    show(then);
    fetch(CONFIG.apiBaseUrl + '/api/kiosk/' + encodeURIComponent(kioskToken) + '/checkin', {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicianId: personId })
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
