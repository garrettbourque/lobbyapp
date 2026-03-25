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

  function runShortcut(shortcutName) {
    var url = 'shortcuts://run-shortcut?name=' + encodeURIComponent(shortcutName);
    // iOS behavior varies by browser/standalone + Guided Access.
    // - Normal flow: navigate top-level so Shortcuts runs.
    // - Guided Access: top-level navigation is often blocked (no app switch), so we
    //   fall back to a hidden iframe attempt if the page never became hidden.
    var leftApp = false;
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') leftApp = true;
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    // First attempt: match a user gesture by navigating the top frame.
    window.top.location.href = url;

    // If Guided Access prevented switching apps, the page likely stays visible;
    // try the iframe method as a fallback.
    setTimeout(function () {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (leftApp) return;

      var iframe = document.createElement('iframe');
      iframe.setAttribute('style', 'position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none');
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);
      iframe.src = url;
      setTimeout(function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }, 800);
  }

  function buildCounselorButtons() {
    counselorButtonsContainer.innerHTML = '';
    CONFIG.counselors.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = c.name;
      btn.dataset.shortcutName = c.shortcutName;
      btn.addEventListener('click', function () {
        showScreen('arrival');
        startReturnHomeCountdown('arrival', arrivalCountdownEl);
        runShortcut(c.shortcutName);
      });
      counselorButtonsContainer.appendChild(btn);
    });
  }

  function init() {
    officePhoneLink.textContent = CONFIG.officePhone;
    officePhoneLink.href = 'tel:' + CONFIG.officePhoneTel;

    buildCounselorButtons();

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
