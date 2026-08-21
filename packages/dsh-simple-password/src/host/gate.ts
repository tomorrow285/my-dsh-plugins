/**
 * Browser gate script injected into index.html <head> by the host half.
 *
 * The script is a plain inline <script> — module scripts are deferred and run
 * only after the document is parsed — so its synchronous top-level part runs
 * BEFORE any React bundle can mount:
 *
 *  1. the document is locked immediately (data-dsh-simple-password-locked on
 *     <html> + a `#root { display: none !important }` rule appended to head),
 *     so the application mounts into a hidden container and content never
 *     becomes visible before authentication;
 *  2. on DOMContentLoaded a full-screen password wall (plain DOM, no
 *     framework) is built and the saved credential in localStorage is verified
 *     asynchronously: success removes the lock, failure shows the input form;
 *  3. with no saved credential the wall asks for the password when the server
 *     has one, or offers first-time setup when it does not.
 *
 * The lock is JS-owned state plus an inline style: editing page CSS cannot
 * reveal #root, because the wall is an opaque overlay above everything and
 * both the attribute and the rule are removed only by the verified JS path.
 */

/** Inline script text (no `</script>` literal; plain string, no template). */
export const GATE_SCRIPT = `(function () {
  'use strict';
  var STORAGE_KEY = 'dsh-simple-password:credential';
  var API = '/dsh-simple-password';
  var LOCK_ATTR = 'data-dsh-simple-password-locked';
  var WALL_ID = 'dsh-simple-password-wall';
  var STYLE_ID = 'dsh-simple-password-style';
  var REQ_HEADER = 'X-DSH-Simple-Password-Request';
  var docEl = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (err) { saved = null; }

  // ---- Synchronous, before any deferred module script: lock now. ----
  docEl.setAttribute(LOCK_ATTR, '');
  var lockStyle = document.createElement('style');
  lockStyle.id = STYLE_ID;
  lockStyle.textContent = 'html[' + LOCK_ATTR + '] #root{display:none !important}';
  document.head.appendChild(lockStyle);

  function apiHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    headers[REQ_HEADER] = '1';
    return headers;
  }

  function fetchJson(url, method, body) {
    return fetch(url, {
      method: method,
      headers: apiHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) { return res.json().catch(function () { return {}; }); });
  }

  function unlock() {
    docEl.removeAttribute(LOCK_ATTR);
    var style = document.getElementById(STYLE_ID);
    if (style !== null) style.remove();
    var wall = document.getElementById(WALL_ID);
    if (wall !== null) wall.remove();
  }

  function setWallMode(wall, mode, message) {
    var title = wall.querySelector('[data-role="title"]');
    var hint = wall.querySelector('[data-role="hint"]');
    var form = wall.querySelector('[data-role="form"]');
    var error = wall.querySelector('[data-role="error"]');
    var checking = wall.querySelector('[data-role="checking"]');
    var button = wall.querySelector('button');
    var input = wall.querySelector('input');
    var setup = mode === 'setup';
    if (title !== null) title.textContent = setup ? 'Set a password' : 'Enter password';
    if (hint !== null) hint.textContent = setup
      ? 'No password is set for this DeepSeek Harness yet. Choose one to protect it.'
      : 'This DeepSeek Harness is password-protected.';
    if (button !== null) button.textContent = setup ? 'Set password' : 'Unlock';
    if (form !== null) form.style.display = mode === 'input' || mode === 'setup' ? '' : 'none';
    if (checking !== null) checking.style.display = mode === 'checking' ? '' : 'none';
    if (error !== null) {
      error.style.display = message ? '' : 'none';
      error.textContent = message || '';
    }
    if (input !== null) input.focus();
  }

  function buildWall(mode, message) {
    var wall = document.createElement('div');
    wall.id = WALL_ID;
    wall.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:#f5f6f8', 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
      'color:#1f2328', 'padding:24px'
    ].join(';');
    var card = document.createElement('div');
    card.style.cssText = [
      'width:min(360px,100%)', 'background:#ffffff', 'border:1px solid #d8dee4',
      'border-radius:12px', 'padding:28px', 'box-shadow:0 8px 40px rgba(31,35,40,.12)'
    ].join(';');
    var title = document.createElement('div');
    title.setAttribute('data-role', 'title');
    title.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:6px';
    title.textContent = 'Enter password';
    var hint = document.createElement('div');
    hint.setAttribute('data-role', 'hint');
    hint.style.cssText = 'font-size:13px;color:#57606a;margin-bottom:16px';
    hint.textContent = '';
    var checking = document.createElement('div');
    checking.setAttribute('data-role', 'checking');
    checking.style.cssText = 'font-size:14px;color:#57606a;padding:8px 0';
    checking.textContent = 'Checking…';
    var form = document.createElement('form');
    form.setAttribute('data-role', 'form');
    form.style.cssText = 'display:none';
    var input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.placeholder = 'Password';
    input.style.cssText = [
      'width:100%', 'box-sizing:border-box', 'padding:10px 12px',
      'background:#ffffff', 'border:1px solid #d0d7de', 'border-radius:8px',
      'color:#1f2328', 'font-size:14px', 'outline:none', 'margin-bottom:12px'
    ].join(';');
    var button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Unlock';
    button.style.cssText = [
      'width:100%', 'padding:10px 12px', 'border:none', 'border-radius:8px',
      'background:#0969da', 'color:#ffffff', 'font-size:14px', 'font-weight:600',
      'cursor:pointer'
    ].join(';');
    var error = document.createElement('div');
    error.setAttribute('data-role', 'error');
    error.style.cssText = 'font-size:13px;color:#cf222e;margin-top:12px;display:none';
    error.textContent = '';
    form.appendChild(input);
    form.appendChild(button);
    form.appendChild(error);
    card.appendChild(title);
    card.appendChild(hint);
    card.appendChild(checking);
    card.appendChild(form);
    wall.appendChild(card);
    document.body.appendChild(wall);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = input.value;
      if (!value) return;
      submit(value);
    });
    setWallMode(wall, mode, message);
    return wall;
  }

  function submit(password) {
    var wall = document.getElementById(WALL_ID);
    if (wall === null) return;
    var checking = wall.querySelector('[data-role="checking"]');
    if (checking !== null) checking.style.display = '';
    var form = wall.querySelector('[data-role="form"]');
    if (form !== null) form.style.display = 'none';
    var error = wall.querySelector('[data-role="error"]');
    if (error !== null) error.style.display = 'none';

    fetchJson(API + '/status', 'GET').then(function (status) {
      var configured = status && status.configured === true;
      var req = configured
        ? fetchJson(API + '/verify', 'POST', { password: password })
        : fetchJson(API + '/setup', 'POST', { password: password });
      return req.then(function (result) {
        if (result && result.ok) {
          try { localStorage.setItem(STORAGE_KEY, password); } catch (err) { /* ignore */ }
          unlock();
        } else {
          setWallMode(wall, configured ? 'input' : 'setup', result && result.error ? result.error : 'Incorrect password.');
        }
      });
    }).catch(function () {
      setWallMode(wall, 'input', 'Cannot reach the password service. Refresh to retry.');
    });
  }

  function start() {
    // Do not show any dialog until both the saved credential (localStorage,
    // read synchronously above) and the server state are known. The wall is
    // built only from the final answer:
    //   - saved credential verified  → unlock() (no dialog at all)
    //   - otherwise                  → build the matching form afterwards.
    if (saved !== null && saved !== '') {
      fetchJson(API + '/verify', 'POST', { password: saved }).then(function (result) {
        if (result && result.ok) {
          unlock();
        } else {
          buildWall('input', 'Saved password is no longer valid.');
        }
      }).catch(function () {
        buildWall('input', 'Cannot reach the password service. Refresh to retry.');
      });
      return;
    }
    fetchJson(API + '/status', 'GET').then(function (status) {
      var configured = status && status.configured === true;
      buildWall(configured ? 'input' : 'setup', null);
    }).catch(function () {
      buildWall('input', 'Cannot reach the password service. Refresh to retry.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();`
