// Shared helpers for the LobbyApp site pages.

window.Lobby = (function () {
  'use strict';

  // JSON request to the API; resolves to { status, data } and never throws on HTTP errors.
  function api(method, path, body) {
    var options = { method: method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(path, options)
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .catch(function () {
        return { status: 0, data: { ok: false, error: 'Could not reach LobbyApp. Check your connection and try again.' } };
      });
  }

  // Builds an element: el('a', { href: '/', text: 'Home', className: 'btn' }, [children]).
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'className') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function formValues(form) {
    var values = {};
    new FormData(form).forEach(function (value, key) { values[key] = value; });
    return values;
  }

  function showNotice(el, text, kind) {
    if (!el) return;
    el.className = 'notice notice-' + (kind || 'error');
    el.textContent = text || '';
  }

  // Submits a form as JSON; onSuccess gets the response data.
  function bindForm(form, method, path, onSuccess, transform) {
    var notice = form.querySelector('.notice');
    var button = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showNotice(notice, '');
      var body = formValues(form);
      if (transform) {
        var problem = transform(body);
        if (problem) {
          showNotice(notice, problem);
          return;
        }
      }
      if (button) button.disabled = true;
      api(method, path, body).then(function (r) {
        if (button) button.disabled = false;
        if (r.data.ok) {
          onSuccess(r.data, form);
        } else {
          showNotice(notice, r.data.error || 'Something went wrong. Please try again.');
        }
      });
    });
  }

  // Swaps "Sign in / Get started" for "Dashboard" when already signed in.
  function authNav() {
    var nav = document.querySelector('[data-auth-nav]');
    if (!nav) return;
    api('GET', '/api/account').then(function (r) {
      if (!r.data.ok) return;
      nav.querySelectorAll('[data-signed-out]').forEach(function (el) { el.hidden = true; });
      nav.querySelectorAll('[data-signed-in]').forEach(function (el) { el.hidden = false; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    authNav();
    var year = document.querySelector('[data-year]');
    if (year) year.textContent = new Date().getFullYear();
  });

  return { api: api, el: el, bindForm: bindForm, showNotice: showNotice, formValues: formValues };
})();
