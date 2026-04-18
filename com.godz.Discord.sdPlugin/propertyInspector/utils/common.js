// Godz Discord Plugin - Common Utilities
// DOM helpers, event system, and utility functions for Property Inspector

// Event emitter
class EventEmitter {
  constructor() { this._handlers = {}; }
  on(name, fn) {
    (this._handlers[name] = this._handlers[name] || []).push(fn);
    return this;
  }
  off(name, fn) {
    const h = this._handlers[name];
    if (h) this._handlers[name] = h.filter(f => f !== fn);
  }
  emit(name, data) {
    (this._handlers[name] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('Event error:', e); }
    });
  }
}

const $emit = new EventEmitter();

// DOM query helper with extensions
function $(selector, isAll) {
  if (typeof selector !== 'string') return selector;
  const el = isAll
    ? document.querySelectorAll(selector)
    : document.querySelector(selector);
  if (el && !isAll) {
    el.on = (evt, fn) => { el.addEventListener(evt, fn); return el; };
    el.attr = (key, val) => val === undefined ? el.getAttribute(key) : (el.setAttribute(key, val), el);
    el.show = () => { el.style.display = ''; return el; };
    el.hide = () => { el.style.display = 'none'; return el; };
    el.toggle = (show) => { el.style.display = show ? '' : 'none'; return el; };
    el.text = (t) => t === undefined ? el.textContent : (el.textContent = t, el);
    el.html = (h) => h === undefined ? el.innerHTML : (el.innerHTML = h, el);
    el.val = (v) => v === undefined ? el.value : (el.value = v, el);
    el.addClass = (c) => { el.classList.add(c); return el; };
    el.removeClass = (c) => { el.classList.remove(c); return el; };
    el.hasClass = (c) => el.classList.contains(c);
  }
  return el;
}

// Throttle
$.throttle = (fn, delay) => {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      return fn(...args);
    }
  };
};

// Debounce
$.debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// Create select options from array
$.populateSelect = (selectEl, items, valueKey = 'id', textKey = 'name', currentValue) => {
  const el = typeof selectEl === 'string' ? $(selectEl) : selectEl;
  if (!el) return;
  el.innerHTML = '';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = typeof item === 'object' ? item[valueKey] : item;
    opt.textContent = typeof item === 'object' ? item[textKey] : item;
    if (currentValue && opt.value === currentValue) {
      opt.selected = true;
    }
    el.appendChild(opt);
  });
};

// Utility: make HTML safe
$.escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};
