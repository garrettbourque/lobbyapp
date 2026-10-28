(function () {
  'use strict';

  const screens = {
    home: document.getElementById('screen-home'),
    counselor: document.getElementById('screen-counselor'),
    arrival: document.getElementById('screen-arrival'),
    noAppointment: document.getElementById('screen-no-appointment')
  };

  const arrivalCountdownEl = document.getElementById('arrival-countdown');
  const noAppointmentCountdownEl = document.getElementById('no-appointment-countdown');
  const officePhoneLink = document.getElementById('office-phone-link');
  const counselorButtonsContainer = document.getElementById('counselor-buttons');

  // Secret from the kiosk link (lobbyapp.app/?kiosk=...) naming this iPad's facility.
  const kioskToken = new URLSearchParams(window.location.search).get('kiosk');

  let returnHomeTimer = null;

  function showScreen(screenId) {
    Object.values(screens).forEach(function (el) {
      el.classList.remove('active');
    });
    const target = screens[screenId];
    if (target) target.classList.add('active');
  }

  function clearReturnHomeTimer() {
    if (returnHomeTimer) {
      clearInterval(returnHomeTimer);
      returnHomeTimer = null;
    }
  }

  function startReturnHomeCountdown(screenId, countdownEl) {
    clearReturnHomeTimer();
    let remaining = CONFIG.returnHomeSeconds;
    if (countdownEl) {
      countdownEl.textContent = 'Returning to home in ' + remaining + ' seconds.';
    }
    returnHomeTimer = setInterval(function () {
      remaining -= 1;
      if (countdownEl) {
        countdownEl.textContent = 'Returning to home in ' + remaining + ' seconds.';
      }
      if (remaining <= 0) {
        clearReturnHomeTimer();
        showScreen('home');
      }
    }, 1000);
  }

  function postCheckin(counselor) {
    fetch(CONFIG.apiBaseUrl + '/api/kiosk/' + encodeURIComponent(kioskToken) + '/checkin', {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicianId: counselor.id })
    }).catch(function () {});
  }

  function buildCounselorButtons(counselors) {
    counselorButtonsContainer.innerHTML = '';
    if (!counselors.length) {
      var msg = document.createElement('p');
      msg.className = 'instructions';
      msg.textContent = 'This kiosk is not set up yet.';
      counselorButtonsContainer.appendChild(msg);
      return;
    }
    counselors.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = c.name;
      btn.addEventListener('click', function () {
        showScreen('arrival');
        startReturnHomeCountdown('arrival', arrivalCountdownEl);
        postCheckin(c);
      });
      counselorButtonsContainer.appendChild(btn);
    });
  }

  function setOfficePhone(phone) {
    officePhoneLink.textContent = phone;
    officePhoneLink.href = 'tel:' + String(phone).replace(/[^0-9+]/g, '');
  }

  function applyKioskData(data) {
    setOfficePhone(data.facility.officePhone);
    buildCounselorButtons(data.clinicians);
  }

  // The facility's clinician list comes from the server and is refreshed
  // periodically, so edits show up without touching the iPad. The last good
  // copy is cached so a network blip at startup doesn't blank the kiosk.
  function loadKiosk() {
    var cacheKey = 'kiosk:' + kioskToken;
    fetch(CONFIG.apiBaseUrl + '/api/kiosk/' + encodeURIComponent(kioskToken), { mode: 'cors', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) {
          buildCounselorButtons([]);
          return;
        }
        applyKioskData(data);
        try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
      })
      .catch(function () {
        var cached = null;
        try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch (e) {}
        if (cached) applyKioskData(cached);
      });
  }

  function init() {
    setOfficePhone('');
    if (kioskToken) {
      loadKiosk();
      setInterval(loadKiosk, CONFIG.kioskRefreshMinutes * 60 * 1000);
    } else {
      buildCounselorButtons([]);
    }

    document.body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'yes') {
        showScreen('counselor');
      } else if (action === 'no') {
        clearReturnHomeTimer();
        showScreen('noAppointment');
        startReturnHomeCountdown('noAppointment', noAppointmentCountdownEl);
      } else if (action === 'home') {
        clearReturnHomeTimer();
        showScreen('home');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
