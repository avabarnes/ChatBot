(function () {
  'use strict';

  var MAX_CHARS = 2000;
  var HISTORY_LIMIT = 10; // recent messages sent as context
  var TIMEOUT_MS = 30000;

  var SUGGESTIONS = [
    'Explain how black holes work in simple terms',
    'Brainstorm 5 names for a podcast about space',
    'Write a short, friendly email asking for a deadline extension',
    'What are good habits for learning something new?'
  ];

  var log = document.getElementById('log');
  var welcome = document.getElementById('welcome');
  var chips = document.getElementById('chips');
  var form = document.getElementById('composer');
  var input = document.getElementById('message');
  var sendBtn = document.getElementById('send');
  var counter = document.getElementById('counter');
  var newChatBtn = document.getElementById('new-chat');
  var themeBtn = document.getElementById('theme-toggle');

  var history = []; // {role, content}
  var busy = false;
  var controller = null;

  /* ---------- Theme ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function syncThemeButton() {
    var light = currentTheme() === 'light';
    themeBtn.setAttribute('aria-pressed', String(light));
    themeBtn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
  }
  themeBtn.addEventListener('click', function () {
    var next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('orbit-theme', next); } catch (e) {}
    syncThemeButton();
  });
  syncThemeButton();

  /* ---------- Rendering ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Inline `code` and **bold**, built with DOM nodes (never innerHTML).
  function appendInline(parent, text) {
    var re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      if (tok.charAt(0) === '`') parent.appendChild(el('code', null, tok.slice(1, -1)));
      else parent.appendChild(el('strong', null, tok.slice(2, -2)));
      last = m.index + tok.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderBotText(container, text) {
    var parts = text.split(/```/);
    parts.forEach(function (part, i) {
      if (i % 2 === 1) {
        var code = part.replace(/^[^\n]*\n/, ''); // drop language tag line
        var pre = el('pre');
        pre.tabIndex = 0;
        pre.appendChild(el('code', null, code.replace(/\n$/, '')));
        container.appendChild(pre);
      } else {
        part.split(/\n{2,}/).forEach(function (para) {
          if (!para.trim()) return;
          var p = el('p');
          appendInline(p, para.replace(/^\n+|\n+$/g, ''));
          container.appendChild(p);
        });
      }
    });
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function addUser(text) {
    var m = el('div', 'msg msg-user', text);
    log.appendChild(m);
    scrollDown();
  }

  function addBot(text) {
    var m = el('div', 'msg msg-bot');
    m.appendChild(el('span', 'label who', 'Orbit'));
    renderBotText(m, text);
    log.appendChild(m);
    scrollDown();
  }

  function addTyping() {
    var m = el('div', 'msg msg-bot');
    m.setAttribute('role', 'status');
    m.appendChild(el('span', 'label who', 'Orbit is thinking'));
    var dots = el('span', 'typing');
    dots.setAttribute('aria-hidden', 'true');
    dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
    m.appendChild(dots);
    log.appendChild(m);
    scrollDown();
    return m;
  }

  function addError(message) {
    var m = el('div', 'msg msg-error');
    m.setAttribute('role', 'alert');
    m.appendChild(el('span', 'label', 'Something went wrong'));
    m.appendChild(el('span', null, message));
    var retry = el('button', 'btn btn-ghost', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', function () {
      m.remove();
      requestReply();
    });
    m.appendChild(document.createElement('br'));
    m.appendChild(retry);
    log.appendChild(m);
    scrollDown();
    retry.focus();
  }

  /* ---------- Networking ---------- */
  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    sendBtn.setAttribute('aria-busy', String(state));
  }

  function requestReply() {
    if (busy) return;
    setBusy(true);
    var typing = addTyping();
    controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-HISTORY_LIMIT) }),
      signal: controller.signal
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.reply) {
            throw new Error(data.error || 'Request failed (' + res.status + ').');
          }
          return data.reply;
        });
      })
      .then(function (reply) {
        typing.remove();
        history.push({ role: 'assistant', content: reply });
        addBot(reply);
      })
      .catch(function (err) {
        typing.remove();
        if (err && err.name === 'AbortError') {
          if (!controller) return; // cancelled by New chat
          addError('The request took too long. Please try again.');
        } else if (err instanceof TypeError) {
          addError('Could not connect. Check your internet connection and try again.');
        } else {
          addError(err.message);
        }
      })
      .then(function () {
        clearTimeout(timer);
        setBusy(false);
        if (document.activeElement === document.body) input.focus();
      });
  }

  function submit(text) {
    text = text.trim();
    if (!text || busy) return;
    welcome.hidden = true;
    history.push({ role: 'user', content: text.slice(0, MAX_CHARS) });
    addUser(text);
    input.value = '';
    resize();
    updateCounter();
    requestReply();
  }

  /* ---------- Composer ---------- */
  function resize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight + 4, 160) + 'px';
  }
  function updateCounter() {
    var n = input.value.length;
    counter.textContent = n + ' / ' + MAX_CHARS;
    counter.classList.toggle('near', n > MAX_CHARS * 0.9);
  }

  input.addEventListener('input', function () { resize(); updateCounter(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit(input.value);
    }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submit(input.value);
  });

  /* ---------- Suggestions & new chat ---------- */
  SUGGESTIONS.forEach(function (q) {
    var li = el('li');
    var b = el('button', 'chip', q);
    b.type = 'button';
    b.addEventListener('click', function () { submit(q); });
    li.appendChild(b);
    chips.appendChild(li);
  });

  newChatBtn.addEventListener('click', function () {
    if (controller) { var c = controller; controller = null; c.abort(); }
    history = [];
    setBusy(false);
    Array.prototype.slice.call(log.children).forEach(function (n) {
      if (n !== welcome) n.remove();
    });
    welcome.hidden = false;
    input.value = '';
    resize();
    updateCounter();
    input.focus();
  });

  updateCounter();
})();
