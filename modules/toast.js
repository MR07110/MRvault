/**
 * Toast notification module — queue tizimi bilan.
 * Tezkor ketma-ket toast lar bir-birini ustma-ust yopmaydi.
 */

const _queue = [];
let _active = false;

function _process() {
  if (_active || !_queue.length) return;
  _active = true;
  const { msg, type, dur } = _queue.shift();
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (type ? ` toast-${type}` : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { _active = false; _process(); }, 300);
  }, dur);
}

/**
 * Show a brief notification toast.
 * @param {string} msg
 * @param {'success'|'error'|'info'|''} [type]
 * @param {number} [dur]
 */
export function toast(msg, type = '', dur = 2200) {
  _queue.push({ msg, type, dur });
  _process();
}