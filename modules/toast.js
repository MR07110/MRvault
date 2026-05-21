/**
 * Show a brief notification toast.
 * @param {string} msg
 * @param {'success'|'error'|'info'|''} [type]
 * @param {number} [dur]
 */
export function toast(msg, type = '', dur = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (type ? ` toast-${type}` : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur);
}