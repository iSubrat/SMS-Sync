/* ===========================
   SMS Sync — script.js
   Mobile-first web app logic (HTML/CSS/JS/PHP demo)
   =========================== */

/* ------------------------------
   Globals & Utilities
------------------------------ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const state = {
  user: null,                 // { email }
  csrfToken: null,
  items: [],                  // full list from server (after /list)
  filter: 'all',              // all | unread | starred | archived | trash
  sort: 'desc',               // 'desc' (newest first) | 'asc'
  search: '',
  selectedIds: new Set(),
  focusedIndex: -1,           // current index in rendered list
  previewLen: Number(localStorage.getItem('sms_preview_len') || 60),
  theme: localStorage.getItem('sms_theme') || 'auto',
  lastUndo: null,             // { type: 'single'|'bulk', action, payload, revertFn }
  isDesktop: () => window.matchMedia('(min-width: 900px)').matches
};

const API_URL = 'process.php';
const DEMO = {
  email: 'isubrat@icloud.com',
  password: 'subrat@1234'
};

function setCSRF(token) {
  state.csrfToken = token;
  document.querySelector('meta[name="csrf-token"]')?.setAttribute('content', token || '');
}

async function apiPost(path, body = {}) {
  const payload = path === '/login' || path === '/session' ? body : { csrfToken: state.csrfToken, ...body };
  const res = await fetch(API_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, ...payload })
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('Invalid server response'); }
  if (!res.ok || data?.ok === false) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase()).join('') || '?';
}

function formatRelative(ts) {
  const now = Date.now();
  const d = new Date(ts);
  const diff = (now - d.getTime()) / 1000; // seconds
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function snippet(text, len = state.previewLen) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length <= len ? t : t.slice(0, len - 1) + '…';
}

function findOTP(text) {
  // 4–8 digit sequences, common OTP formats
  const m = String(text || '').match(/(?<!\d)(\d{4,8})(?!\d)/);
  return m ? m[1] : null;
}

/* ------------------------------
   Elements
------------------------------ */
// App chrome
const appBar = $('#app-bar');
const searchBar = $('#searchBar');
const tabs = $('#tabs');

// Login
const loginView = $('#loginView');
const loginForm = $('#loginForm');
const emailInput = $('#email');
const passwordInput = $('#password');
const togglePasswordBtn = $('#togglePassword');
const rememberMeChk = $('#rememberMe');
const loginError = $('#loginError');

// App view
const appView = $('#appView');
const listPane = $('#listPane');
const messageList = $('#messageList');
const skeletonList = $('#skeletonList');
const emptyState = $('#emptyState');
const clearFiltersBtn = $('#clearFiltersBtn');

// Detail pane
const detailPane = $('#detailPane');
const detailHeader = $('#detailHeader');
const detailSender = $('#detailSender');
const detailMeta = $('#detailMeta');
const detailBody = $('#detailBody');
const detailText = $('#detailText');
const detailPlaceholder = $('#detailPlaceholder');
const otpChip = $('#otpChip');
const otpText = $('#otpText');
const copyOtpBtn = $('#copyOtpBtn');

// Detail actions
const backToListBtn = $('#backToListBtn');
const detailStarBtn = $('#detailStarBtn');
const detailReadToggleBtn = $('#detailReadToggleBtn');
const detailArchiveBtn = $('#detailArchiveBtn');
const detailTrashBtn = $('#detailTrashBtn');
const detailMoreBtn = $('#detailMoreBtn');
const detailMenu = $('#detailMenu');
const prevMsgBtn = $('#prevMsgBtn');
const nextMsgBtn = $('#nextMsgBtn');

// Search + sort
const searchToggleBtn = $('#searchToggleBtn');
const searchInput = $('#searchInput');
const clearSearchBtn = $('#clearSearchBtn');
const sortBtn = $('#sortBtn');
const sortLabel = $('#sortLabel');

// Batch selection
const batchBar = $('#batchBar');
const batchCount = $('#batchCount');
const batchClose = $('#batchClose');

// Menus & dialogs
const kebabBtn = $('#kebabBtn');
const appMenu = $('#appMenu');
const settingsDialog = $('#settingsDialog');
const settingsEmail = $('#settingsEmail');
const signOutBtn = $('#signOutBtn');
const menuSettings = $('#menuSettings');
const menuAbout = $('#menuAbout');
const menuLogout = $('#menuLogout');
const themeToggleBtn = $('#themeToggleBtn');
const themeRadios = $$('.segmented input[name="theme"]');
const previewRange = $('#previewRange');
const previewValue = $('#previewValue');
const aboutLink = $('#aboutLink');

const confirmDialog = $('#confirmDialog');
const confirmOkBtn = $('#confirmOkBtn');

const snackbar = $('#snackbar');
const snackbarText = $('#snackbarText');
const snackbarUndo = $('#snackbarUndo');
const toast = $('#toast');
const toastText = $('#toastText');

// FABs & PTR
const fabBar = $('#fabBar');
const refreshFab = $('#refreshFab');
const scrollTopFab = $('#scrollTopFab');
const ptr = $('#ptr');

// Templates
const itemTpl = $('#msg-item-template');

/* ------------------------------
   Theme handling
------------------------------ */
function applyTheme(theme) {
  // theme: 'auto' | 'light' | 'dark'
  document.documentElement.setAttribute('data-theme', theme);
  // For CSS hooks if needed
  document.documentElement.setAttribute('data-theme-applied',
    theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
  );
  localStorage.setItem('sms_theme', theme);
  // Update quick toggle icon
  themeToggleBtn.querySelector('.material-symbols-rounded').textContent =
    (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches))
      ? 'light_mode' : 'dark_mode';
  // Reflect radios
  themeRadios.forEach(r => { r.checked = (r.value === theme); });
}

function toggleThemeQuick() {
  const current = state.theme;
  const next = current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark';
  state.theme = next;
  applyTheme(next);
}

/* ------------------------------
   Login & Session
------------------------------ */
function showLogin() {
  loginView.hidden = false;
  appBar.hidden = true;
  searchBar.hidden = true;
  tabs.hidden = true;
  appView.hidden = true;
  fabBar.hidden = true;
  // Remember me email
  const savedEmail = localStorage.getItem('sms_remember_email');
  if (savedEmail) {
    emailInput.value = savedEmail;
    rememberMeChk.checked = true;
    passwordInput.focus();
  }
}

function showApp() {
  loginView.hidden = true;
  appBar.hidden = false;
  searchBar.hidden = false;
  tabs.hidden = false;
  appView.hidden = false;
  fabBar.hidden = !/Mobi|Android/i.test(navigator.userAgent) ? true : false;
}

async function tryRestoreSession() {
  try {
    const data = await apiPost('/session');
    if (data?.ok && data?.user) {
      state.user = data.user;
      setCSRF(data.csrfToken);
      settingsEmail.textContent = state.user.email;
      showApp();
      await loadList();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

/* ------------------------------
   List fetching & rendering
------------------------------ */
async function loadList({ showSkeleton = true } = {}) {
  // Preserve selection, focusedIndex mapped later
  if (showSkeleton) {
    skeletonList.hidden = false;
    messageList.hidden = true;
    emptyState.hidden = true;
  }
  try {
    const payload = {
      filter: state.filter,
      search: state.search,
      sort: state.sort
    };
    const data = await apiPost('/list', payload);
    state.items = Array.isArray(data.items) ? data.items : [];
    renderList();
  } catch (e) {
    showToast(`Failed to load: ${e.message}`);
  } finally {
    skeletonList.hidden = true;
  }
}

function visibleItems() {
  // Already filtered by server for simplicity; still keep in client state
  return state.items.slice();
}

function renderList() {
  messageList.innerHTML = '';
  const items = visibleItems();

  if (!items.length) {
    messageList.hidden = true;
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;
  messageList.hidden = false;

  items.forEach((it, idx) => {
    const li = itemTpl.content.firstElementChild.cloneNode(true);
    li.dataset.id = it.id;
    li.tabIndex = 0;

    // unread style
    if (!it.read && !it.trashed) li.classList.add('unread');

    // desktop checkbox
    const checkbox = $('.item-select', li);
    checkbox.checked = state.selectedIds.has(it.id);
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleSelect(it.id, checkbox.checked);
    });

    // avatar
    const av = $('.avatar--sender', li);
    av.textContent = initials(it.sender || it.phone);

    // main
    $('.sender', li).textContent = it.sender || it.phone || 'Unknown';
    const snip = (it.archived ? '[Archived] ' : '') + snippet(it.body);
    $('.snippet', li).textContent = snip;

    const t = new Date(it.timestamp);
    const timeEl = $('.time', li);
    timeEl.textContent = formatRelative(t);
    timeEl.title = t.toLocaleString();

    // tags
    const tagsEl = $('.tags', li);
    if (Array.isArray(it.tags) && it.tags.length) {
      tagsEl.innerHTML = it.tags.map(tag => `<span class="chip">${escapeHtml(tag)}</span>`).join('');
    } else {
      tagsEl.remove();
    }

    // star
    const starBtn = $('.star-btn', li);
    starBtn.setAttribute('aria-pressed', it.starred ? 'true' : 'false');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStar(it);
    });

    // overflow menu
    const overflowBtn = $('.overflow-btn', li);
    const itemMenu = $('.item-menu', li);
    hydrateItemMenu(itemMenu, it);
    attachMenu(overflowBtn, itemMenu);

    // click opens detail
    li.addEventListener('click', () => openDetail(it.id));
    li.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openDetail(it.id);
      }
    });

    // long-press (mobile) to select
    addLongPress(li, () => {
      toggleSelect(it.id, true);
    });

    // swipe gestures
    addSwipe(li, {
      onRight() {
        it.read ? actionOnItem(it, 'mark_unread') : actionOnItem(it, 'mark_read');
      },
      onLeft() {
        if (!it.trashed) actionOnItem(it, 'trash');
      }
    });

    messageList.appendChild(li);

    // Remember focused index mapping
    if (state.focusedIndex === idx) {
      li.focus();
    }
  });

  // Update batch bar
  updateBatchBar();
}

function hydrateItemMenu(menuEl, it) {
  // Reset
  menuEl.innerHTML = '';
  const make = (action, label, icon, klass = '') => {
    const btn = document.createElement('button');
    btn.setAttribute('role', 'menuitem');
    btn.className = `menu-item ${klass}`;
    btn.dataset.action = action;
    btn.innerHTML = `<span class="material-symbols-rounded">${icon}</span>${label}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      actionOnItem(it, action);
    });
    return btn;
  };

  // Contextual options
  if (it.read) {
    menuEl.appendChild(make('mark_unread', 'Mark as unread', 'mark_email_unread'));
  } else {
    menuEl.appendChild(make('mark_read', 'Mark as read', 'drafts'));
  }

  if (it.starred) {
    menuEl.appendChild(make('unstar', 'Unstar', 'star_rate'));
  } else {
    menuEl.appendChild(make('star', 'Star', 'star'));
  }

  if (it.archived) {
    menuEl.appendChild(make('unarchive', 'Move to Inbox', 'unarchive'));
  } else {
    menuEl.appendChild(make('archive', 'Archive', 'archive'));
  }

  if (it.trashed) {
    menuEl.appendChild(make('restore', 'Restore from Trash', 'restore_from_trash'));
    menuEl.appendChild(make('delete_forever', 'Delete forever', 'delete_forever', 'danger'));
  } else {
    menuEl.appendChild(make('trash', 'Move to trash', 'delete'));
  }
}

/* ------------------------------
   Detail rendering
------------------------------ */
function openDetail(id) {
  const idx = state.items.findIndex(x => x.id === id);
  if (idx === -1) return;
  state.focusedIndex = idx;
  const it = state.items[idx];

  // Mark read optimistically when opening (if not already trashed)
  if (!it.read && !it.trashed) {
    actionOnItem(it, 'mark_read', { silent: true });
  }

  detailSender.textContent = it.sender || it.phone || 'Unknown';
  const dt = new Date(it.timestamp);
  detailMeta.textContent = `${dt.toLocaleString()} • ${it.phone || it.senderId || ''}`.trim();

  detailText.textContent = it.body || '';

  // OTP
  const otp = findOTP(it.body);
  if (otp) {
    otpText.textContent = otp;
    otpChip.hidden = false;
  } else {
    otpChip.hidden = true;
  }

  // Action button states
  detailStarBtn.setAttribute('aria-pressed', it.starred ? 'true' : 'false');
  detailReadToggleBtn.querySelector('.material-symbols-rounded').textContent = it.read ? 'mark_email_unread' : 'drafts';

  // Context menu for detail
  detailMenu.innerHTML = '';
  const ctx = [];
  if (it.archived) ctx.push(['unarchive', 'Move to Inbox', 'unarchive']);
  if (it.trashed) ctx.push(['restore', 'Restore from Trash', 'restore_from_trash'], ['delete_forever', 'Delete forever', 'delete_forever', 'danger']);
  ctx.forEach(([a, label, icon, klass]) => {
    const b = document.createElement('button');
    b.className = `menu-item ${klass || ''}`;
    b.setAttribute('role', 'menuitem');
    b.dataset.action = a;
    b.innerHTML = `<span class="material-symbols-rounded">${icon}</span>${label}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      actionOnItem(it, a);
    });
    detailMenu.appendChild(b);
  });

  // Show detail pane content
  detailPlaceholder.hidden = true;
  detailHeader.hidden = false;
  detailBody.hidden = false;

  // On mobile, scroll pane to top
  detailPane.scrollTop = 0;

  // Update next/prev enabled
  prevMsgBtn.disabled = (idx <= 0);
  nextMsgBtn.disabled = (idx >= state.items.length - 1);
}

function closeDetailOnMobile() {
  if (!state.isDesktop()) {
    detailHeader.hidden = true;
    detailBody.hidden = true;
    detailPlaceholder.hidden = false;
  }
}

/* ------------------------------
   Actions & Optimistic updates
------------------------------ */
function updateLocalItem(it, action) {
  const prev = { ...it };
  switch (action) {
    case 'mark_read': it.read = true; break;
    case 'mark_unread': it.read = false; break;
    case 'star': it.starred = true; break;
    case 'unstar': it.starred = false; break;
    case 'archive': it.archived = true; break;
    case 'unarchive': it.archived = false; break;
    case 'trash': it.trashed = true; break;
    case 'restore': it.trashed = false; break;
    case 'delete_forever':
      // Remove from local list
      state.items = state.items.filter(x => x.id !== it.id);
      break;
  }
  return prev;
}

async function actionOnItem(it, action, { silent = false } = {}) {
  const prev = updateLocalItem(it, action);
  renderList();
  if ($('#detailHeader').hidden === false && state.items.find(x => x.id === it.id)) {
    // re-render detail if same item still exists
    openDetail(it.id);
  } else if (action === 'delete_forever' || (action === 'trash' && state.filter === 'all')) {
    // close detail if removed from current view
    closeDetailOnMobile();
  }

  // Set undo
  setUndo({
    type: 'single',
    action,
    payload: { id: it.id, prev },
    revertFn: async () => {
      // revert locally
      Object.assign(it, prev);
      if (action === 'delete_forever') {
        // Can't restore without server; ask server to restore from "trash backup" if any.
        // For demo, just re-fetch list
        await loadList({ showSkeleton: false });
      } else {
        renderList();
      }
      // Call reverse action to server
      const reverse = ({
        mark_read: 'mark_unread',
        mark_unread: 'mark_read',
        star: 'unstar',
        unstar: 'star',
        archive: 'unarchive',
        unarchive: 'archive',
        trash: 'restore',
        restore: 'trash',
        delete_forever: null
      })[action];
      if (reverse) {
        await apiPost('/update', { id: it.id, action: reverse });
      }
    }
  }, actionLabel(action) + ' • Undo?');

  if (!silent) showSnackbar(actionLabel(action), true);

  try {
    const resp = await apiPost('/update', { id: it.id, action });
    // trust server item if returned
    if (resp?.item) {
      const idx = state.items.findIndex(x => x.id === resp.item.id);
      if (idx !== -1) state.items[idx] = resp.item;
      renderList();
      if (resp.item.id === it.id && !detailHeader.hidden) openDetail(resp.item.id);
    }
  } catch (e) {
    // revert on failure
    if (action === 'delete_forever') {
      // re-fetch
      await loadList({ showSkeleton: false });
    } else {
      Object.assign(it, prev);
      renderList();
      if (!detailHeader.hidden) openDetail(it.id);
    }
    showToast(`Failed: ${e.message}`);
  }
}

function actionLabel(action) {
  switch (action) {
    case 'mark_read': return 'Marked as read';
    case 'mark_unread': return 'Marked as unread';
    case 'star': return 'Starred';
    case 'unstar': return 'Unstarred';
    case 'archive': return 'Archived';
    case 'unarchive': return 'Moved to Inbox';
    case 'trash': return 'Moved to Trash';
    case 'restore': return 'Restored';
    case 'delete_forever': return 'Deleted forever';
    default: return 'Done';
  }
}

async function bulkAction(action) {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return;
  const prevMap = new Map();
  // Optimistic
  ids.forEach(id => {
    const it = state.items.find(x => x.id === id);
    if (!it) return;
    prevMap.set(id, { ...it });
    updateLocalItem(it, action);
  });
  renderList();
  setUndo({
    type: 'bulk',
    action,
    payload: { ids, prevMap },
    revertFn: async () => {
      ids.forEach(id => {
        const it = state.items.find(x => x.id === id);
        const prev = prevMap.get(id);
        if (it && prev) Object.assign(it, prev);
      });
      renderList();
      const reverse = ({
        mark_read: 'mark_unread',
        mark_unread: 'mark_read',
        star: 'unstar',
        unstar: 'star',
        archive: 'unarchive',
        unarchive: 'archive',
        trash: 'restore',
        restore: 'trash',
        delete_forever: null
      })[action];
      if (reverse) {
        await apiPost('/bulk', { ids, action: reverse });
      } else {
        await loadList({ showSkeleton: false });
      }
    }
  }, `${actionLabel(action)} ${ids.length} messages • Undo?`);
  try {
    await apiPost('/bulk', { ids, action });
  } catch (e) {
    // revert
    ids.forEach(id => {
      const it = state.items.find(x => x.id === id);
      const prev = prevMap.get(id);
      if (it && prev) Object.assign(it, prev);
    });
    renderList();
    showToast(`Bulk failed: ${e.message}`);
  } finally {
    clearSelection();
  }
}

/* ------------------------------
   Selection & Batch UI
------------------------------ */
function toggleSelect(id, on) {
  if (on) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  updateBatchBar();
}

function updateBatchBar() {
  const n = state.selectedIds.size;
  if (n > 0) {
    batchBar.hidden = false;
    batchCount.textContent = String(n);
  } else {
    batchBar.hidden = true;
  }
}

function clearSelection() {
  state.selectedIds.clear();
  updateBatchBar();
  // Uncheck any visible checkboxes
  $$('.item-select', messageList).forEach(cb => (cb.checked = false));
}

/* ------------------------------
   Menus
------------------------------ */
function attachMenu(btn, menu) {
  function open() {
    closeAllMenus();
    menu.hidden = false;
    document.addEventListener('click', onDocClick, { once: true });
    window.addEventListener('keydown', onEsc, { once: true });
  }
  function onDocClick(e) {
    if (!menu.contains(e.target) && e.target !== btn) close();
  }
  function onEsc(e) { if (e.key === 'Escape') close(); }
  function close() { menu.hidden = true; }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });
}

function closeAllMenus() {
  $$('.menu').forEach(m => m.hidden = true);
}

/* ------------------------------
   Snackbar & Toast
------------------------------ */
let snackbarTimer = null;

function showSnackbar(text, withUndo = false) {
  snackbarText.textContent = text;
  snackbar.hidden = false;
  snackbarUndo.hidden = !withUndo;
  if (snackbarTimer) clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => { snackbar.hidden = true; }, 5000);
}

function showToast(text) {
  toastText.textContent = text;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 3000);
}

function setUndo(entry, textForSnackbar) {
  state.lastUndo = entry;
  showSnackbar(textForSnackbar || 'Action done', true);
}

/* ------------------------------
   Search, Filters, Sort
------------------------------ */
function setFilter(newFilter) {
  state.filter = newFilter;
  // Tabs UI
  $$('.tab').forEach(t => {
    const act = t.dataset.filter === newFilter;
    t.classList.toggle('is-active', act);
    t.setAttribute('aria-selected', act ? 'true' : 'false');
  });
  loadList();
}

function toggleSort() {
  state.sort = state.sort === 'desc' ? 'asc' : 'desc';
  sortLabel.textContent = state.sort === 'desc' ? 'Newest' : 'Oldest';
  loadList({ showSkeleton: false });
}

function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const onSearchInput = debounce(() => {
  state.search = searchInput.value.trim();
  loadList({ showSkeleton: false });
}, 250);

/* ------------------------------
   Gestures: long-press & swipe
------------------------------ */
function addLongPress(el, callback, ms = 450) {
  let t = null;
  el.addEventListener('pointerdown', (e) => {
    if (state.isDesktop()) return;
    if (e.button !== 0) return;
    t = setTimeout(() => { callback(); }, ms);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
    el.addEventListener(evt, () => { if (t) { clearTimeout(t); t = null; } })
  );
}

function addSwipe(el, { onLeft, onRight }) {
  let startX = 0, curX = 0, dragging = false;

  el.addEventListener('pointerdown', (e) => {
    if (state.isDesktop()) return;
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    curX = e.clientX - startX;
    el.style.transform = `translateX(${curX}px)`;
    el.style.transition = 'none';
  });

  el.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    el.style.transition = 'transform .15s ease';
    const threshold = 60;
    if (curX > threshold && typeof onRight === 'function') {
      el.style.transform = 'translateX(100%)';
      setTimeout(() => { el.style.transform = ''; }, 160);
      onRight();
    } else if (curX < -threshold && typeof onLeft === 'function') {
      el.style.transform = 'translateX(-100%)';
      setTimeout(() => { el.style.transform = ''; }, 160);
      onLeft();
    } else {
      el.style.transform = '';
    }
  });

  el.addEventListener('pointercancel', () => {
    dragging = false;
    el.style.transform = '';
  });
}

/* ------------------------------
   Pull to refresh (mobile)
------------------------------ */
(function initPTR() {
  let startY = 0, pulling = false, activated = false;
  const threshold = 70;

  listPane.addEventListener('touchstart', (e) => {
    if (listPane.scrollTop === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
      activated = false;
    }
  }, { passive: true });

  listPane.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      ptr.style.transform = `translateY(${Math.min(dy, 100)}px)`;
      if (dy > threshold && !activated) {
        activated = true;
        ptr.querySelector('.ptr-text').textContent = 'Release to refresh';
      } else if (dy <= threshold && activated) {
        activated = false;
        ptr.querySelector('.ptr-text').textContent = 'Pull to refresh';
      }
    }
  }, { passive: true });

  listPane.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    ptr.style.transform = '';
    if (activated) {
      ptr.querySelector('.ptr-text').textContent = 'Refreshing…';
      await loadList({ showSkeleton: false });
      ptr.querySelector('.ptr-text').textContent = 'Pull to refresh';
    }
  });
})();

/* ------------------------------
   Keyboard shortcuts (desktop)
------------------------------ */
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  switch (e.key) {
    case '/':
      e.preventDefault();
      searchInput.focus();
      break;
    case 'j':
      focusNext(1);
      break;
    case 'k':
      focusNext(-1);
      break;
    case 'r':
      {
        const it = currentFocusedItem();
        if (it) actionOnItem(it, it.read ? 'mark_unread' : 'mark_read');
      }
      break;
    case 's':
      {
        const it = currentFocusedItem();
        if (it) actionOnItem(it, it.starred ? 'unstar' : 'star');
      }
      break;
    case 'Delete':
      {
        const it = currentFocusedItem();
        if (it) {
          if (state.filter === 'trash') openDeleteForeverConfirm(it);
          else actionOnItem(it, 'trash');
        }
      }
      break;
  }
});

function currentFocusedItem() {
  if (state.focusedIndex < 0) return null;
  return state.items[state.focusedIndex] || null;
}

function focusNext(delta) {
  if (!state.items.length) return;
  state.focusedIndex = Math.min(state.items.length - 1, Math.max(0, state.focusedIndex + delta));
  const id = state.items[state.focusedIndex].id;
  const el = messageList.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (el) {
    el.focus();
    openDetail(id);
    el.scrollIntoView({ block: 'nearest' });
  }
}

/* ------------------------------
   Event Wiring
------------------------------ */
// Login form
togglePasswordBtn.addEventListener('click', () => {
  const visible = passwordInput.type === 'text';
  passwordInput.type = visible ? 'password' : 'text';
  togglePasswordBtn.querySelector('.material-symbols-rounded').textContent = visible ? 'visibility' : 'visibility_off';
  togglePasswordBtn.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    loginError.textContent = 'Please enter email and password.';
    loginError.hidden = false;
    return;
  }
  try {
    const resp = await apiPost('/login', { email, password, remember: true });
    if (rememberMeChk.checked) {
      localStorage.setItem('sms_remember_email', email);
    } else {
      localStorage.removeItem('sms_remember_email');
    }
    setCSRF(resp.csrfToken);
    state.user = { email };
    settingsEmail.textContent = email;
    showApp();
    await loadList();
  } catch (err) {
    loginError.textContent = err.message || 'Invalid credentials';
    loginError.hidden = false;
  }
});

// Search & sort
searchToggleBtn.addEventListener('click', () => {
  searchInput.focus();
});
searchInput.addEventListener('input', onSearchInput);
clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  state.search = '';
  loadList({ showSkeleton: false });
  searchInput.focus();
});
sortBtn.addEventListener('click', toggleSort);

// Tabs
$$('.tab', tabs).forEach(tab => {
  tab.addEventListener('click', () => setFilter(tab.dataset.filter));
});

// Detail buttons
backToListBtn.addEventListener('click', closeDetailOnMobile);
detailStarBtn.addEventListener('click', () => {
  const it = currentFocusedItem();
  if (it) actionOnItem(it, it.starred ? 'unstar' : 'star');
});
detailReadToggleBtn.addEventListener('click', () => {
  const it = currentFocusedItem();
  if (it) actionOnItem(it, it.read ? 'mark_unread' : 'mark_read');
});
detailArchiveBtn.addEventListener('click', () => {
  const it = currentFocusedItem();
  if (it) actionOnItem(it, it.archived ? 'unarchive' : 'archive');
});
detailTrashBtn.addEventListener('click', () => {
  const it = currentFocusedItem();
  if (it) {
    if (state.filter === 'trash') openDeleteForeverConfirm(it);
    else actionOnItem(it, 'trash');
  }
});

detailMoreBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  detailMenu.hidden = !detailMenu.hidden;
  if (!detailMenu.hidden) {
    document.addEventListener('click', onDetailMenuDoc, { once: true });
  }
});
function onDetailMenuDoc(ev) {
  if (!detailMenu.contains(ev.target) && ev.target !== detailMoreBtn) {
    detailMenu.hidden = true;
  }
}

prevMsgBtn.addEventListener('click', () => focusNext(-1));
nextMsgBtn.addEventListener('click', () => focusNext(1));

// OTP copy
copyOtpBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(otpText.textContent);
    showSnackbar('OTP copied');
  } catch { showToast('Copy failed'); }
});

// Batch bar buttons
batchClose.addEventListener('click', clearSelection);
$$('[data-batch]').forEach(btn => {
  btn.addEventListener('click', () => bulkAction(btn.dataset.batch));
});

// App menu
attachMenu(kebabBtn, appMenu);
menuSettings.addEventListener('click', () => {
  appMenu.hidden = true;
  previewRange.value = String(state.previewLen);
  previewValue.textContent = String(state.previewLen);
  settingsDialog.showModal();
});
menuAbout.addEventListener('click', () => {
  appMenu.hidden = true;
  alert('SMS Sync (demo)\nA mobile-first web app UI to view synced SMS.\nBuild: 2025-09-04');
});
menuLogout.addEventListener('click', async () => {
  appMenu.hidden = true;
  try { await apiPost('/logout', { csrfToken: state.csrfToken }); } catch {}
  state.user = null;
  setCSRF(null);
  // Clear UI
  showLogin();
});

// Settings dialog
signOutBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await apiPost('/logout', { csrfToken: state.csrfToken }); } catch {}
  settingsDialog.close();
  state.user = null;
  setCSRF(null);
  showLogin();
});

themeToggleBtn.addEventListener('click', toggleThemeQuick);
themeRadios.forEach(r => r.addEventListener('change', () => {
  state.theme = r.value;
  applyTheme(state.theme);
}));
previewRange.addEventListener('input', () => {
  previewValue.textContent = previewRange.value;
});
previewRange.addEventListener('change', () => {
  state.previewLen = Number(previewRange.value);
  localStorage.setItem('sms_preview_len', String(state.previewLen));
  renderList();
});

// Snackbar undo
snackbarUndo.addEventListener('click', async () => {
  snackbar.hidden = true;
  if (!state.lastUndo) return;
  try {
    await state.lastUndo.revertFn();
  } catch (e) {
    showToast(`Undo failed: ${e.message}`);
  } finally {
    state.lastUndo = null;
  }
});

// FABs
refreshFab.addEventListener('click', () => loadList({ showSkeleton: false }));
scrollTopFab.addEventListener('click', () => listPane.scrollTo({ top: 0, behavior: 'smooth' }));

// About link on login
aboutLink.addEventListener('click', (e) => {
  e.preventDefault();
  alert('SMS Sync is a demo web app to view your synced SMS.\nUse the demo login to explore.');
});

/* ------------------------------
   Helper: Escape HTML
------------------------------ */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ------------------------------
   Confirm delete forever
------------------------------ */
function openDeleteForeverConfirm(it) {
  confirmDialog.returnValue = 'cancel';
  confirmDialog.showModal();
  confirmOkBtn.onclick = async () => {
    confirmDialog.close();
    await actionOnItem(it, 'delete_forever');
  };
}

/* ------------------------------
   Star toggle shortcut
------------------------------ */
function toggleStar(it) { actionOnItem(it, it.starred ? 'unstar' : 'star'); }

/* ------------------------------
   Init
------------------------------ */
(function init() {
  // Initial theme
  applyTheme(state.theme);

  // Restore session or show login
  tryRestoreSession();

  // Close menus on ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllMenus();
  });

  // Clicking outside detail menu closes it
  document.addEventListener('click', (e) => {
    if (!detailMenu.contains(e.target) && e.target !== detailMoreBtn) {
      detailMenu.hidden = true;
    }
  });
})();
