// ===========================
// TEACHER DASHBOARD
// ===========================

const state = {
  currentFormStep: 1,
  selectedClassId: null,
  selectedSubjectId: null,
  classesData: [],
  classSubjectsBuffer: [],
  currentView: 'dashboard', // 'dashboard' | 'attendance'
  activeTimers: {}, // Store timers by classId: { classId: { intervalId, remainingMinutes, isPaused } }
  teacherFirstName: '',
};

const API = {
  addClass:          '/api/add-class',
  teacherClasses:    '/api/teacher-classes',
  addSubjects:       (classId) => `/api/add-subjects/${classId}`,
  classSubjects:     (classId) => `/api/class-subjects/${classId}`,
  deleteClass:       (classId) => `/api/delete-class/${classId}`,
  deleteSubject:     (classId, subjectId) => `/api/delete-subject/${classId}/${subjectId}`,
  updatePasscode:    (classId) => `/api/update-passcode/${classId}`,
  subjectAttendance: (classId, subjectId) => `/api/subject-attendance/${classId}/${subjectId}`,
};

// ===========================
// UTILITIES
// ===========================
function toDisplayDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d)) return null;
  // Use UTC values to avoid timezone shift on date-only strings like "2025-05-01"
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function escapeHTML(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function showToast(message, type = 'info') {
  const colors = { info: '#0EA5E9', success: '#22c55e', error: '#ef4444' };
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:12px 20px;border-radius:8px;font-size:14px;color:#fff;
    background:${colors[type] || colors.info};
    box-shadow:0 4px 12px rgba(0,0,0,.3);
    transition:opacity .3s;opacity:1;max-width:320px;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = `
      <div style="background:var(--surface,#fff);border-radius:12px;padding:28px 32px;max-width:380px;width:90%;color:var(--ink,#0f172a);box-shadow:0 8px 32px rgba(0,0,0,.2)">
        <p style="font-size:15px;margin-bottom:20px;line-height:1.5">${escapeHTML(message)}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="confirmCancel" style="padding:8px 18px;border-radius:6px;border:1px solid #e2e8f0;background:none;color:var(--ink,#0f172a);cursor:pointer;font-size:13px">Cancel</button>
          <button id="confirmOk" style="padding:8px 18px;border-radius:6px;border:none;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmOk').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.querySelector('#confirmCancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
  });
}

async function withLoading(btn, label, fn) {
  const orig = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { await fn(); } finally { btn.disabled = false; btn.textContent = orig; }
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// Helper function to check if a new schedule overlaps with existing subjects
function checkScheduleOverlap(newDaysStr, newStart, newEnd, existingSubjects) {
  if (!newStart || !newEnd || !newDaysStr) return null;
  const newDays = newDaysStr.split(',').map(d => d.trim());
  
  const toMin = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h * 60) + (m || 0);
  };
  const nStart = toMin(newStart);
  const nEnd = toMin(newEnd);

  for (const subj of existingSubjects) {
    if (!subj.start_time || !subj.end_time || !subj.days) continue;
    if (subj.start_time === '00:00' && subj.end_time === '00:00') continue; // Skip default 00:00 placeholders

    const eDays = Array.isArray(subj.days) ? subj.days : String(subj.days).split(',').map(d => d.trim());
    const hasCommonDay = newDays.some(d => eDays.includes(d));

    if (hasCommonDay) {
      const eStart = toMin(subj.start_time);
      const eEnd = toMin(subj.end_time);
      if (nStart < eEnd && eStart < nEnd) return subj;
    }
  }
  return null;
}

// Custom Time Picker Wrapper Logic
window.updateTimeStr = function(hiddenId, hId, mId, aId) {
  const hInput = document.getElementById(hId);
  const mInput = document.getElementById(mId);
  const aInput = document.getElementById(aId);
  const hiddenInput = document.getElementById(hiddenId);
  
  if (!hInput || !mInput || !aInput || !hiddenInput) return;

  // Visual feedback highlight kapag pinindot ang up/down arrows
  const active = document.activeElement;
  if (active === hInput || active === mInput || active === aInput) {
    active.style.transition = 'none';
    active.style.backgroundColor = '#dbeafe'; // Light blue highlight
    
    clearTimeout(active.flashTimer);
    active.flashTimer = setTimeout(() => {
      active.style.transition = 'background-color 0.4s ease';
      active.style.backgroundColor = '';
    }, 150);
  }

  let h = parseInt(hInput.value);
  let m = parseInt(mInput.value);
  
  if (isNaN(h)) h = 12;
  if (isNaN(m)) m = 0;
  
  if (h < 1) h = 12;
  if (h > 12) h = 1;
  if (m < 0) m = 59;
  if (m > 59) m = 0;
  
  hInput.value = h;
  mInput.value = m.toString().padStart(2, '0');
  
  let hours24 = h;
  if (aInput.value === 'AM' && h === 12) hours24 = 0;
  if (aInput.value === 'PM' && h < 12) hours24 += 12;
  
  hiddenInput.value = hours24.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
};

// ===========================
// TIME
// ===========================

function updateTime() {
  const now = new Date();
  const el = document.getElementById('liveTime');
  if (el) el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  
  updateGreeting();
}

function updateGreeting(nameStr) {
  if (nameStr) state.teacherFirstName = nameStr.split(' ')[0] || nameStr;
  
  const h = new Date().getHours();
  let greet = 'Good night';
  if (h >= 5 && h < 12) greet = 'Good morning';
  else if (h >= 12 && h < 18) greet = 'Good afternoon';
  else if (h >= 18 && h < 22) greet = 'Good evening';

  const el = document.getElementById('dashGreeting');
  if (el) el.textContent = state.teacherFirstName ? `${greet}, ${state.teacherFirstName} 👋` : `${greet} 👋`;
}

// ===========================
// INIT
// ===========================

document.addEventListener('DOMContentLoaded', () => {
  updateTime();
  setInterval(updateTime, 1000);

  // ── Header dropdowns — exact same pattern as student dashboard ──
  var profileBtn      = document.getElementById('profileBtn');
  var profileDropdown = document.getElementById('profileDropdown');
  var notifBtn        = document.getElementById('notifBtn');
  var notifDropdown   = document.getElementById('notifDropdown');

  if (profileBtn && profileDropdown) {
    profileBtn.onclick = function(e) {
      e.stopPropagation();
      var isOpen = profileDropdown.style.display === 'block';
      profileDropdown.style.display = isOpen ? 'none' : 'block';
      if (notifDropdown) notifDropdown.style.display = 'none';
    };
    profileDropdown.onclick = function(e) { e.stopPropagation(); };
  }

  if (notifBtn && notifDropdown) {
    notifBtn.onclick = function(e) {
      e.stopPropagation();
      var isOpen = notifDropdown.style.display === 'block';
      notifDropdown.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        var dot = notifBtn.querySelector('.notif-dot');
        if (dot) dot.style.display = 'none';
        if (profileDropdown) profileDropdown.style.display = 'none';
      }
    };
    notifDropdown.onclick = function(e) { e.stopPropagation(); };

    var markReadBtn = notifDropdown.querySelector('.card-header span');
    if (markReadBtn) {
      markReadBtn.onclick = function(e) {
        e.stopPropagation();
        var dot = notifBtn.querySelector('.notif-dot');
        if (dot) dot.style.display = 'none';
      };
    }
  }

  // Close both when clicking anywhere else — same as student dashboard
  window.addEventListener('click', function() {
    if (notifDropdown)   notifDropdown.style.display   = 'none';
    if (profileDropdown) profileDropdown.style.display = 'none';
  });

  // ── Logout ──
  var lb = document.getElementById('logoutBtn');
  if (lb) lb.onclick = function() { window.location.href = '/logout'; };

  // ── Navigation View Switchers ──
  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.addEventListener('click', (e) => {
      const href = nav.getAttribute('href') || '';
      if (href === '#dashboard' || nav.id === 'dashboardNavBtn') { e.preventDefault(); showDashboardView(); }
      else if (href === '#schedule' || nav.id === 'scheduleNavBtn') { e.preventDefault(); showScheduleView(); }
      else if (href === '#settings' || nav.id === 'settingsNavBtn') { e.preventDefault(); showSettingsView(); }
    });
  });

  document.getElementById('classList')?.addEventListener('click', handleClassListClick);
  loadClasses().catch(console.error);
  loadSessions().catch(console.error);
  updateTeacherNotifications();
  // Auto-refresh notifications (pending requests) every 30 seconds
  setInterval(updateTeacherNotifications, 30000);
  loadTeacherProfile();
});

function setupDropdown(btnId, dropdownId) {
  const btn = document.getElementById(btnId);
  const dd  = document.getElementById(dropdownId);
  if (!btn || !dd) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dd.style.display === 'block';
    // Close all dropdowns first
    document.getElementById('notifDropdown').style.display = 'none';
    document.getElementById('profileDropdown').style.display = 'none';
    // Then open this one if it was closed
    if (!isOpen) dd.style.display = 'block';
  });
}

// ===========================
// EVENT DELEGATION — main class list
// ===========================

function handleClassListClick(e) {
  const sel = e.target.closest('[data-action="select-class"]');
  const del = e.target.closest('[data-action="delete-class"]');
  const ds  = e.target.closest('[data-action="delete-subject"]');
  if (sel) { const id = Number(sel.dataset.classId); selectClass(id); toggleClassSubjects(id); }
  if (del) deleteClass(Number(del.dataset.classId));
  if (ds)  deleteSubject(Number(ds.dataset.classId), Number(ds.dataset.subjectId));
}

// ===========================
// SIDEBAR — render class tree
// ===========================

/**
 * Rebuilds the sidebar class list from state.classesData.
 * Subjects must already be loaded into each class object (cls.subjects).
 * Called after loadClasses() which eagerly fetches all subjects.
 */
function renderSidebarClasses() {
  const container = document.getElementById('sidebarClassList');
  if (!container) return;

  const classes = state.classesData;
  if (!classes || classes.length === 0) {
    container.innerHTML = '<div class="sb-empty">No classes yet.</div>';
    return;
  }

  // Remember which class dropdowns are open
  const openIds = new Set(
    [...container.querySelectorAll('.sb-class-toggle.open')].map(el => el.dataset.classId)
  );

  container.innerHTML = '';

  classes.forEach(cls => {
    const isOpen   = openIds.has(String(cls.id));
    const subjects = cls.subjects || [];

    const wrap = document.createElement('div');

    // ── class toggle row ──
    const toggle = document.createElement('button');
    toggle.className = 'sb-class-toggle' + (isOpen ? ' open' : '');
    toggle.dataset.classId = cls.id;
    toggle.innerHTML = `
      <svg class="sb-class-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
      </svg>
      <span class="sb-class-name" title="${escapeHTML(cls.class_name)}">${escapeHTML(cls.class_name)}</span>
      <svg class="sb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>`;

    // ── children panel ──
    const children = document.createElement('div');
    children.className = 'sb-class-children' + (isOpen ? ' open' : '');

    // subjects list
    if (subjects.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sb-subject-row';
      empty.innerHTML = '<span style="opacity:.4;font-style:italic">No subjects yet</span>';
      children.appendChild(empty);
    } else {
      subjects.forEach(sub => {
        // Subject row wrapper
        const rowWrapper = document.createElement('div');
        rowWrapper.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
        
        // Subject button
        const row = document.createElement('button');
        row.className = 'sb-subject-row sb-subject-clickable';
        row.style.flex = '1';
        row.style.margin = '0';
        row.title = `View attendance for ${sub.subject}`;
        const timeStr = fmtTimeRange(sub.start_time, sub.end_time);
        const roomStr = sub.room && sub.room !== 'TBD' ? ` · ${escapeHTML(sub.room)}` : '';
        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px; width:100%">
            <div style="width:28px; height:28px; border-radius:6px; background:rgba(99,153,255,0.15); color:#8bb4ff; display:grid; place-items:center; flex-shrink:0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
            </div>
            <div style="flex:1; min-width:0; text-align:left;">
              <div class="sb-subject-name" style="font-size:12.5px; font-weight:600; color:rgba(255,255,255,0.9);">${escapeHTML(sub.subject)}</div>
              ${(timeStr || roomStr) ? `<div class="sb-subject-time" style="font-size:10.5px; color:rgba(255,255,255,0.5); margin-top:3px; line-height:1.2;">${timeStr}${roomStr}</div>` : ''}
            </div>
          </div>
        `;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          openAttendanceView(cls, sub);
        });
        
        rowWrapper.appendChild(row);
        children.appendChild(rowWrapper);
      });
    }

    // ── action buttons row ──
    const actionsRow = document.createElement('div');
    actionsRow.className = 'sb-actions-row';

    // Add Subject
    const addBtn = document.createElement('button');
    addBtn.className = 'sb-add-btn';
    addBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      Add Subject`;
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedClassId = cls.id;
      selectClass(cls.id);
      openSubjectModal();
    });

    actionsRow.appendChild(addBtn);
    children.appendChild(actionsRow);

    toggle.addEventListener('click', () => {
      const nowOpen = toggle.classList.toggle('open');
      children.classList.toggle('open', nowOpen);
    });

    wrap.appendChild(toggle);
    wrap.appendChild(children);
    container.appendChild(wrap);
  });
}

function fmtTimeRange(start, end) {
  if (!start) return '';
  const fmt = t => { if (!t) return ''; const [h, m] = t.split(':'); const hh = +h % 12 || 12; return `${hh}:${m}${+h < 12 ? 'am' : 'pm'}`; };
  return end ? `${fmt(start)}–${fmt(end)}` : fmt(start);
}

// ===========================


// =====================================================================
// ATTENDANCE VIEW — EXCEL-STYLE EDITABLE GRID


// =====================================================================
// ATTENDANCE VIEW — EXCEL-STYLE EDITABLE GRID (REDESIGNED)
// Replace the entire section from "const excelState = {" down to
// "function exportAttendanceCSV" in your teacherdata.js
// =====================================================================

// ── State for the Excel grid ──────────────────────────────────────────
const excelState = {
  isEditMode: false,
  pendingChanges: {},
  allRecords: [],
  classRef: null,
  subjectRef: null,
  enrolledStudents: [], // { name, email } from DB
};

// ── Helpers ───────────────────────────────────────────────────────────
function statusCycle(current) {
  if (!current || current === '' || current === 'na') return 'present';
  if (current === 'present') return 'absent';
  if (current === 'absent')  return 'late';
  if (current === 'late')    return 'na';
  return 'present';
}

// Avatar colors — one per student, cycling
const AVATAR_COLORS = [
  { bg: '#4f46e5', text: '#fff' },
  { bg: '#0891b2', text: '#fff' },
  { bg: '#059669', text: '#fff' },
  { bg: '#d97706', text: '#fff' },
  { bg: '#dc2626', text: '#fff' },
  { bg: '#7c3aed', text: '#fff' },
  { bg: '#db2777', text: '#fff' },
  { bg: '#0284c7', text: '#fff' },
  { bg: '#16a34a', text: '#fff' },
  { bg: '#9333ea', text: '#fff' },
];

function getAvatarColor(index) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function cellStyle(status) {
  const map = {
    present: { bg: 'rgba(34,197,94,.15)',   color: '#22c55e', border: 'rgba(34,197,94,.3)' },
    absent:  { bg: 'rgba(239,68,68,.15)',   color: '#ef4444', border: 'rgba(239,68,68,.3)' },
    late:    { bg: 'rgba(245,158,11,.15)',  color: '#f59e0b', border: 'rgba(245,158,11,.3)' },
    na:      { bg: 'rgba(100,116,139,.12)', color: '#94a3b8', border: 'rgba(100,116,139,.2)' },
    null:    { bg: 'var(--dark-700)',        color: 'var(--text-sub)', border: 'rgba(79,172,254,.12)' },
  };
  return map[status] || map.null;
}
// Helper to check if a string is a real email
function isRealEmail(str) {
  if (!str || str === 'null') return false;
  if (str.endsWith('@unlinked')) return false;
  return str.includes('@') && str.includes('.');
}
function fmtColDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return { day: dateStr, mon: '', year: '' };
  return {
    day:  String(d.getDate()).padStart(2, '0'),
    mon:  d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    year: String(d.getFullYear()),
  };
}

// ── Main view ─────────────────────────────────────────────────────────
function openAttendanceView(cls, subject) {
  state.currentView = 'attendance';
  state.selectedClassId   = cls.id;
  state.selectedSubjectId = subject.id;
  excelState.classRef   = cls;
  excelState.subjectRef = subject;
  excelState.isEditMode = false;
  excelState.pendingChanges = {};
excelState.enrolledStudents = []; // reset
// Fetch enrolled students for this subject
apiFetch(`/api/enrolled-students/${cls.id}/${subject.id}`)
  .then(data => { excelState.enrolledStudents = data.students || []; })
  .catch(() => {});

  let panel = document.getElementById('attendancePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'attendancePanel';
    panel.style.cssText =
      'position:absolute;inset:0;z-index:1100;background:var(--dark-900);' +
      'display:flex;flex-direction:column;overflow:hidden;';
    document.querySelector('.main').appendChild(panel);
  }

  panel.innerHTML = `
    <style>
      /* ── Attendance panel dark theme ── */
      #attendancePanel {
        font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif;
        background: var(--dark-900);
        color: #e8f2ff;
      }
      .att-topbar {
        background: var(--dark-800);
        border-bottom: 2px solid rgba(79,172,254,.18);
        padding: 0 24px;
        height: 62px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        gap: 12px;
      }
      .att-back-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1.5px solid rgba(79,172,254,.18);
        background: var(--dark-700);
        color: var(--text-sub);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all .15s;
        letter-spacing: .3px;
      }
      .att-back-btn:hover {
        background: var(--dark-600);
        border-color: var(--blue-light);
        color: #e8f2ff;
      }
      .att-action-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 8px;
        border: 1.5px solid rgba(79,172,254,.18);
        background: var(--dark-700);
        color: #e8f2ff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all .15s;
      }
      .att-action-btn:hover {
        background: var(--dark-600);
        border-color: var(--blue-light);
      }
      .att-save-btn {
        background: var(--grad-btn);
        border-color: var(--blue-light);
        color: #fff;
        display: none;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(79,172,254,.25);
      }
      .att-save-btn:hover {
        background: linear-gradient(135deg, #6fbeff 0%, #1a80e8 100%);
        box-shadow: 0 4px 12px rgba(79,172,254,.35);
      }
      .att-cancel-btn {
        border-color: rgba(239,68,68,.3);
        color: #f87171;
        display: none;
      }
      .att-cancel-btn:hover {
        background: rgba(239,68,68,.1);
        border-color: rgba(239,68,68,.5);
      }
      .att-export-btn {
        background: var(--grad-btn);
        border-color: var(--blue-light);
        color: #fff;
        box-shadow: 0 2px 8px rgba(79,172,254,.25);
      }
      .att-export-btn:hover {
        background: linear-gradient(135deg, #6fbeff 0%, #1a80e8 100%);
        box-shadow: 0 4px 12px rgba(79,172,254,.35);
      }

      /* Stats */
      .att-stat-card {
        background: var(--dark-800);
        border-radius: 12px;
        border: 1.5px solid rgba(79,172,254,.18);
        padding: 14px 18px;
        box-shadow: 0 2px 8px rgba(11,18,32,.2);
      }
      .att-stat-label {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .08em;
        margin-bottom: 4px;
        color: var(--text-sub);
      }
      .att-stat-value {
        font-size: 26px;
        font-weight: 900;
        line-height: 1;
        color: #e8f2ff;
      }

      /* Edit mode banner */
      .att-edit-banner {
        display: none;
        background: rgba(245,158,11,.1);
        border: 1.5px solid rgba(245,158,11,.3);
        border-radius: 8px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 700;
        color: #fbbf24;
        align-items: center;
        gap: 6px;
      }

      /* Search bar */
      .att-search-input {
        padding: 9px 14px 9px 38px;
        border: 1.5px solid rgba(79,172,254,.18);
        border-radius: 9px;
        font-size: 13px;
        outline: none;
        width: 260px;
        background: var(--dark-700) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2374a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E") no-repeat 12px center;
        color: #e8f2ff;
        transition: border .15s, box-shadow .15s;
      }
      .att-search-input::placeholder { color: var(--text-sub); }
      .att-search-input:focus {
        border-color: var(--blue-light);
        box-shadow: 0 0 0 3px rgba(79,172,254,.15);
      }
      .att-date-input {
        padding: 9px 12px;
        border: 1.5px solid rgba(79,172,254,.18);
        border-radius: 9px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
        background: var(--dark-700);
        color: #e8f2ff;
        transition: border .15s;
      }
      .att-date-input:focus {
        border-color: var(--blue-light);
        box-shadow: 0 0 0 3px rgba(79,172,254,.15);
      }

      /* Table */
      #excelTable {
        border-collapse: separate;
        border-spacing: 0;
        width: max-content;
        min-width: 100%;
        background: var(--dark-800);
      }
      #excelTable thead th {
        background: var(--dark-800);
        position: sticky;
        top: 0;
        z-index: 3;
      }
      .att-th-student {
        min-width: 230px;
        max-width: 230px;
        padding: 14px 16px;
        text-align: left;
        font-size: 10px;
        font-weight: 800;
        color: var(--text-sub);
        text-transform: uppercase;
        letter-spacing: .08em;
        border-right: 2px solid rgba(79,172,254,.18);
        border-bottom: 2px solid var(--blue-light);
        position: sticky;
        left: 0;
        z-index: 5;
        background: var(--dark-800);
      }
      .att-th-rate {
        min-width: 100px;
        max-width: 100px;
        padding: 14px 10px;
        text-align: center;
        font-size: 10px;
        font-weight: 800;
        color: var(--text-sub);
        text-transform: uppercase;
        letter-spacing: .08em;
        border-right: 2px solid rgba(79,172,254,.18);
        border-bottom: 2px solid var(--blue-light);
        position: sticky;
        left: 230px;
        z-index: 4;
        background: var(--dark-800);
      }
      .att-th-date {
        min-width: 96px;
        max-width: 110px;
        padding: 0;
        border-right: 1px solid rgba(79,172,254,.12);
        border-bottom: 2px solid var(--blue-light);
        text-align: center;
        vertical-align: bottom;
        background: var(--dark-800);
      }
      .att-th-date-inner {
        padding: 10px 8px 12px;
      }
      .att-th-date-mon {
        font-size: 9px;
        font-weight: 800;
        color: var(--text-sub);
        letter-spacing: .1em;
        text-transform: uppercase;
      }
      .att-th-date-day {
        font-size: 22px;
        font-weight: 900;
        color: #e8f2ff;
        line-height: 1;
        margin: 1px 0;
      }
      .att-th-date-year {
        font-size: 9px;
        color: var(--text-sub);
      }

      /* Body rows */
      #excelTable tbody tr {
        transition: background .1s;
        background: var(--dark-900);
      }
      #excelTable tbody tr:hover {
        background: var(--dark-700);
      }
      #excelTable tbody tr:hover td {
        background: var(--dark-700) !important;
      }
      .att-td-student {
        padding: 0;
        border-right: 2px solid rgba(79,172,254,.18);
        border-bottom: 1.5px solid rgba(79,172,254,.08);
        position: sticky;
        left: 0;
        z-index: 2;
        min-width: 230px;
        max-width: 230px;
        background: var(--dark-800);
      }
      .att-td-student-inner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        min-height: 52px;
        box-sizing: border-box;
      }
      .att-avatar {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        font-size: 12px;
        font-weight: 800;
        background: var(--grad-main);
        color: #fff;
      }
      .att-student-name {
        font-size: 13px;
        font-weight: 700;
        color: #e8f2ff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .att-student-email {
        font-size: 10px;
        color: var(--text-sub);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: monospace;
        margin-top: 1px;
      }
      .att-td-rate {
        padding: 8px 10px;
        border-right: 2px solid rgba(79,172,254,.18);
        border-bottom: 1.5px solid rgba(79,172,254,.08);
        position: sticky;
        left: 230px;
        z-index: 2;
        min-width: 100px;
        max-width: 100px;
        vertical-align: middle;
        text-align: center;
        background: var(--dark-800);
      }
      .att-rate-pct {
        font-size: 14px;
        font-weight: 800;
        line-height: 1;
        color: #e8f2ff;
      }
      .att-rate-bar-wrap {
        height: 4px;
        border-radius: 99px;
        background: rgba(79,172,254,.12);
        margin-top: 5px;
        overflow: hidden;
      }
      .att-rate-bar-fill {
        height: 100%;
        border-radius: 99px;
      }
      .att-rate-breakdown {
        font-size: 9px;
        color: var(--text-sub);
        margin-top: 4px;
        font-weight: 600;
        letter-spacing: .3px;
      }
      .att-td-cell {
        padding: 0;
        border-right: 1px solid rgba(79,172,254,.08);
        border-bottom: 1.5px solid rgba(79,172,254,.08);
        text-align: center;
        background: var(--dark-800);
      }
      .att-cell-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 52px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .2px;
        transition: filter .1s;
      }
      .att-cell-inner.editable {
        cursor: pointer;
        border: 2px solid transparent;
        transition: all .12s;
      }
      .att-cell-inner.editable:hover {
        filter: brightness(1.1);
        border-color: rgba(79,172,254,.3) !important;
      }

      /* Legend */
      .att-legend {
        display: flex;
        gap: 14px;
        align-items: center;
        padding: 10px 0 8px;
        font-size: 11px;
        color: var(--text-sub);
        flex-wrap: wrap;
      }
      .att-legend-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-weight: 600;
        color: #e8f2ff;
      }
      .att-legend-dot {
        width: 13px;
        height: 13px;
        border-radius: 4px;
        border: 1.5px solid;
      }

      /* Scrollable wrap */
      .att-table-wrap {
        overflow: auto;
        border: 1.5px solid rgba(79,172,254,.18);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(11,18,32,.3);
        background: var(--dark-800);
      }

      /* Status colors - dark theme */
      .status-present { background: rgba(34,197,94,.15); color: #22c55e; border-color: rgba(34,197,94,.3); }
      .status-absent { background: rgba(239,68,68,.15); color: #ef4444; border-color: rgba(239,68,68,.3); }
      .status-late { background: rgba(245,158,11,.15); color: #f59e0b; border-color: rgba(245,158,11,.3); }
      .status-null { background: var(--dark-700); color: var(--text-sub); border-color: rgba(79,172,254,.12); }
    </style>

    <!-- ── Top bar ── -->
    <div class="att-topbar">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <button id="attendanceBackBtn" class="att-back-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <div style="min-width:0">
          <div style="font-size:15px;font-weight:800;color:#e8f2ff;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHTML(subject.subject)}
          </div>
          <div style="font-size:11px;color:var(--text-sub);margin-top:1px">
            ${escapeHTML(cls.class_name)}
            ${subject.start_time ? ' · ' + fmtTimeRange(subject.start_time, subject.end_time) : ''}
            ${subject.room ? ' · ' + escapeHTML(subject.room) : ''}
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div id="editModeBanner" class="att-edit-banner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
          Edit mode — click any cell to toggle
        </div>

        <button id="attEditBtn" class="att-action-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
          Edit
        </button>
        <button id="attSaveBtn" class="att-save-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Save Changes
        </button>
        <button id="attCancelBtn" class="att-action-btn att-cancel-btn">Cancel</button>

        <button id="attRefreshBtn" class="att-action-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
        <button id="attImportBtn" class="att-action-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 5 17 10"/>
            <line x1="12" y1="5" x2="12" y2="17"/>
          </svg>
          Import
        </button>
        <button id="attExportBtn" class="att-action-btn att-export-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>
    </div>

    <!-- ── Stats row ── -->
    <div id="attendanceStatsRow"
         style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
                padding:16px 24px 0;flex-shrink:0"></div>

    <!-- ── Search / filter bar ── -->
    <div style="padding:12px 24px;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap">
      <input id="attSearchInput" type="text" class="att-search-input"
        placeholder="Search student…" />
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="attDateFrom" type="date" class="att-date-input"
          title="From date" />
        <span style="color:var(--text-sub);font-size:12px;font-weight:600">to</span>
        <input id="attDateTo" type="date" class="att-date-input"
          title="To date" />
        <button id="attDateClearBtn" class="att-action-btn"
          style="padding:6px 10px;font-size:11px;border-color:rgba(239,68,68,.3);color:#f87171"
          title="Clear date filter">✕ Clear</button>
      </div>
    </div>

    <!-- ── Excel grid ── -->
    <div style="flex:1;overflow:auto;padding:0 24px 24px">
      <div id="attendanceTableWrap">
        <div style="padding:48px;text-align:center;color:var(--text-sub)">
          <div style="font-size:22px;margin-bottom:8px">⏳</div>Loading…
        </div>
      </div>
    </div>`;

  panel.style.display = 'flex';

  // Wire up buttons
  document.getElementById('attendanceBackBtn').addEventListener('click', closeAttendanceView);
  document.getElementById('attRefreshBtn').addEventListener('click', () => {
    excelState.isEditMode = false;
    excelState.pendingChanges = {};
    syncEditModeUI();
    fetchAttendanceData(cls.id, subject.id);
  });
  document.getElementById('attImportBtn').addEventListener('click', () => openImportModal(cls, subject));
  document.getElementById('attExportBtn').addEventListener('click', () => exportAttendanceCSV(cls, subject));
document.getElementById('attSearchInput').addEventListener('input', applyAttendanceFilters);
  document.getElementById('attDateFrom').addEventListener('change', applyAttendanceFilters);
  document.getElementById('attDateTo').addEventListener('change', applyAttendanceFilters);
  document.getElementById('attDateClearBtn').addEventListener('click', () => {
    document.getElementById('attDateFrom').value = '';
    document.getElementById('attDateTo').value   = '';
    applyAttendanceFilters();
  });

  document.getElementById('attEditBtn').addEventListener('click', () => {
    excelState.isEditMode = true;
    excelState.pendingChanges = {};
    syncEditModeUI();
    rerenderGrid();
  });
  document.getElementById('attSaveBtn').addEventListener('click', saveAttendanceChanges);
  document.getElementById('attCancelBtn').addEventListener('click', () => {
    excelState.isEditMode = false;
    excelState.pendingChanges = {};
    syncEditModeUI();
    rerenderGrid();
  });

  fetchAttendanceData(cls.id, subject.id);
}

function closeAttendanceView() {
  const panel = document.getElementById('attendancePanel');
  if (panel) panel.style.display = 'none';
  state.currentView = 'dashboard';
  loadClasses().catch(console.error);
}

function syncEditModeUI() {
  const editBtn   = document.getElementById('attEditBtn');
  const saveBtn   = document.getElementById('attSaveBtn');
  const cancelBtn = document.getElementById('attCancelBtn');
  const banner    = document.getElementById('editModeBanner');
  const on = excelState.isEditMode;
  if (editBtn)   editBtn.style.display   = on ? 'none'  : 'flex';
  if (saveBtn)   saveBtn.style.display   = on ? 'flex'  : 'none';
  if (cancelBtn) cancelBtn.style.display = on ? 'flex'  : 'none';
  if (banner)    banner.style.display    = on ? 'flex'  : 'none';
}

async function fetchAttendanceData(classId, subjectId) {
  const wrap = document.getElementById('attendanceTableWrap');
  const statsRow = document.getElementById('attendanceStatsRow');
  if (!wrap) return;

  wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text-sub)">
    <div style="font-size:22px;margin-bottom:8px">⏳</div>Loading attendance records…
  </div>`;

  try {
    const data = await apiFetch(API.subjectAttendance(classId, subjectId));
    let records = data.records || [];

    const sidInt = Math.trunc(Number(subjectId));
    if (sidInt) {
      records = records.filter(r => Math.trunc(Number(r.subject_id)) === sidInt);
    }

    excelState.allRecords = records;

    if (records.length === 0) {
      buildStatsRow([]);
      renderEmptyAttendanceTable();
      return;
    }

    wrap.dataset.records = JSON.stringify(records);
    applyAttendanceFilters();
  } catch (err) {
    wrap.innerHTML = `<div style="padding:32px;text-align:center;color:#f87171">
      Error: ${escapeHTML(err.message)}</div>`;
  }
}

function rerenderGrid() {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap || !wrap.dataset.records) return;
  const records = JSON.parse(wrap.dataset.records);
  buildStatsRow(records);
  renderAttendanceTable(records);
  applySearchFilter();
}

// ── Empty skeleton — same layout but with ghost rows and placeholder columns ──
function renderEmptyAttendanceTable() {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap) return;

  // Generate 5 placeholder date columns (today – today+4 days)
  const today = new Date();
  const placeholderDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return toDisplayDate(d);
  });

  // Generate 4 ghost student rows
  const ghostStudents = [
    { name: 'Student Name',  email: 'student@school.edu' },
    { name: 'Student Name',  email: 'student@school.edu' },
    { name: 'Student Name',  email: 'student@school.edu' },
    { name: 'Student Name',  email: 'student@school.edu' },
  ];

  const colHeaders = placeholderDates.map(d => {
    const { day, mon, year } = fmtColDate(d);
    return `
      <th class="att-th-date">
        <div class="att-th-date-inner">
          <div class="att-th-date-mon" style="opacity:.3">${mon}</div>
          <div class="att-th-date-day" style="opacity:.3">${day}</div>
          <div class="att-th-date-year" style="opacity:.3">${year}</div>
        </div>
      </th>`;
  }).join('');

  const ghostRows = ghostStudents.map((st, ri) => {
    const evenBg = ri % 2 === 0 ? 'var(--dark-900)' : 'var(--dark-800)';
    const cells = placeholderDates.map(() => `
      <td class="att-td-cell" style="background:${evenBg}">
        <div class="att-cell-inner" style="background:var(--dark-800);color:var(--text-sub);height:52px">
          —
        </div>
      </td>`).join('');

    return `
      <tr style="background:${evenBg}">
        <td class="att-td-student" style="background:${evenBg}">
          <div class="att-td-student-inner">
            <div class="att-avatar" style="background:rgba(79,172,254,.12);color:rgba(79,172,254,.12)">
              &nbsp;
            </div>
            <div style="min-width:0">
              <div style="height:11px;width:110px;border-radius:6px;
                          background:rgba(79,172,254,.12);margin-bottom:5px"></div>
              <div style="height:9px;width:140px;border-radius:6px;
                          background:rgba(79,172,254,.08)"></div>
            </div>
          </div>
        </td>
        <td class="att-td-rate" style="background:${evenBg}">
          <div style="height:12px;width:36px;border-radius:6px;background:rgba(79,172,254,.12);margin:0 auto 6px"></div>
          <div class="att-rate-bar-wrap"><div class="att-rate-bar-fill" style="width:0%;background:rgba(79,172,254,.12)"></div></div>
          <div style="height:9px;width:52px;border-radius:6px;background:rgba(79,172,254,.08);margin:5px auto 0"></div>
        </td>
        ${cells}
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="att-legend">
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.3)"></div>
        <span>Present</span>
      </div>
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3)"></div>
        <span>Absent</span>
      </div>
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.3)"></div>
        <span>Late</span>
      </div>
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:var(--dark-700);border-color:rgba(79,172,254,.12)"></div>
        <span>—</span>
      </div>
    </div>
    <div class="att-table-wrap">
      <table id="excelTable">
        <thead>
          <tr>
            <th class="att-th-student">Student</th>
            <th class="att-th-rate">Rate</th>
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          ${ghostRows}
        </tbody>
      </table>
    </div>
    <div style="text-align:center;padding:20px 0 4px;font-size:12px;color:var(--text-sub);font-weight:600">
      No attendance records yet — records will appear here once students check in.
    </div>`;
}

function buildStatsRow(records) {
  const statsRow = document.getElementById('attendanceStatsRow');
  if (!statsRow) return;
  const total   = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent  = records.filter(r => r.status === 'absent').length;
  const late    = records.filter(r => r.status === 'late').length;
  const rate    = total ? Math.round((present / total) * 100) : 0;

  statsRow.innerHTML = [
    { label: 'Total Records',   value: total,       color: '#e8f2ff' },
    { label: 'Present',         value: present,     color: '#22c55e' },
    { label: 'Absent',          value: absent,      color: '#ef4444' },
    { label: 'Attendance Rate', value: rate + '%',  color: '#f59e0b' },
  ].map(s => `
    <div class="att-stat-card">
      <div class="att-stat-label">${s.label}</div>
      <div class="att-stat-value" style="color:${s.color}">${s.value}</div>
    </div>`).join('');
}

function applyAttendanceFilters() {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap || !wrap.dataset.records) return;

  let records = JSON.parse(wrap.dataset.records);
  const dateFrom = document.getElementById('attDateFrom')?.value;
  const dateTo   = document.getElementById('attDateTo')?.value;

  // Convert "YYYY-MM-DD" filter values to UTC midnight timestamps for comparison
  const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00Z').getTime() : null;
  const toTs   = dateTo   ? new Date(dateTo   + 'T23:59:59Z').getTime() : null;

  if (fromTs || toTs) {
    records = records.filter(r => {
      const ts = r.marked_at || r.created_at;
      if (!ts) return false;
      const d = new Date(ts);
      // Use UTC date parts to avoid timezone day-shift
      const recTs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (fromTs && recTs < fromTs) return false;
      if (toTs   && recTs > toTs)   return false;
      return true;
    });
  }

  buildStatsRow(records);

  if (records.length === 0) {
    const msg = (fromTs || toTs)
      ? `No records found ${dateFrom && dateTo
          ? `between <strong>${dateFrom}</strong> and <strong>${dateTo}</strong>`
          : dateFrom
            ? `from <strong>${dateFrom}</strong>`
            : `until <strong>${dateTo}</strong>`}`
      : 'No records found';

    wrap.innerHTML = `
      <div style="padding:48px 20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">📅</div>
        <div style="font-size:14px;font-weight:700;color:#e8f2ff">${msg}</div>
        <div style="font-size:12px;color:var(--text-sub);margin-top:6px">
          Try adjusting or clearing the date range.
        </div>
      </div>`;
    return;
  }

  renderAttendanceTable(records);
  applySearchFilter();
}

function applySearchFilter() {
  const query = (document.getElementById('attSearchInput')?.value || '').toLowerCase();
  document.querySelectorAll('#excelTable tbody tr').forEach(row => {
    row.style.display = row.dataset.search?.includes(query) ? '' : 'none';
  });
}

// ── Core: render the redesigned Excel-style table ─────────────────────
function renderAttendanceTable(records) {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap) return;

// ── Build pivot ──────────────────────────────────────────────────
const studentMap = new Map();
const dateSet    = new Set();

records.forEach(r => {
  const ts   = r.marked_at || r.created_at;
  const dStr = toDisplayDate(ts);

  // Group by name (lowercase) as the merge key
  const nameKey = (r.student_name || '').toLowerCase().trim();
  if (!nameKey) return;

  if (!studentMap.has(nameKey)) {
    studentMap.set(nameKey, {
      name:   r.student_name,
      email:  r.student_email || '',
      // track all emails this name appears under
      emails: new Set(),
    });
  }

  const entry = studentMap.get(nameKey);

  // Prefer a real email over unlinked/null
  if (isRealEmail(r.student_email) && !isRealEmail(entry.email)) {
    entry.email = r.student_email;
  }
  entry.emails.add(r.student_email || nameKey);

  if (dStr) dateSet.add(dStr);
});

const dates    = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
const students = [...studentMap.values()].sort((a, b) => a.name.localeCompare(b.name));

// Lookup: "nameKey|dateStr" → status
// Merge all records for the same name across all their emails
const lookup = {};
records.forEach(r => {
  const ts     = r.marked_at || r.created_at;
  const dStr   = toDisplayDate(ts);
  const nameKey = (r.student_name || '').toLowerCase().trim();
  if (dStr && nameKey) {
    const lookupKey = `${nameKey}|${dStr}`;
    // Don't overwrite a real status with a weaker one
    if (!lookup[lookupKey] || lookup[lookupKey] === 'na') {
      lookup[lookupKey] = r.status;
    }
  }
});
  const isEdit = excelState.isEditMode;

 // ── Column headers ───────────────────────────────────────────────
  const colHeaders = dates.map((d, ci) => {
    const { day, mon, year } = fmtColDate(d);
    return `
      <th class="att-th-date" data-col="${ci}">
        <div class="att-th-date-inner">
          <div class="att-th-date-mon">${mon}</div>
          <div class="att-th-date-day">${day}</div>
          <div class="att-th-date-year">${year}</div>
          ${isEdit ? `
            <button class="att-delete-date-btn" data-date="${escapeHTML(d)}"
              title="Delete all records for ${escapeHTML(d)}"
              style="margin-top:5px;padding:2px 7px;border-radius:5px;border:1px solid rgba(239,68,68,.35);
                     background:rgba(239,68,68,.1);color:#f87171;font-size:9px;font-weight:700;
                     cursor:pointer;transition:all .15s;display:block;width:100%"
              onmouseover="this.style.background='rgba(239,68,68,.25)';this.style.color='#fff'"
              onmouseout="this.style.background='rgba(239,68,68,.1)';this.style.color='#f87171'">
              🗑 Delete
            </button>` : ''}
        </div>
      </th>`;
  }).join('');

  // ── Student rows ─────────────────────────────────────────────────
const rows = students.map((st, ri) => {
  const nameKey = st.name.toLowerCase().trim();   // ← add this
  const initL = (st.name || '?')[0].toUpperCase();
  const av    = getAvatarColor(ri);
  const evenBg = ri % 2 === 0 ? 'var(--dark-900)' : 'var(--dark-800)';

  // Compute summary — use nameKey
  let p = 0, a = 0, l = 0;
  dates.forEach(d => {
    const key = `${nameKey}|${d}`;
    const s   = excelState.pendingChanges[key] !== undefined
      ? excelState.pendingChanges[key]
      : lookup[key];
    if (s === 'present') p++;
    else if (s === 'absent') a++;
    else if (s === 'late') l++;
  });
    const total  = p + a + l;
    const pct    = total ? Math.round((p / total) * 100) : 0;
    const rateColor = pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#dc2626';

    const breakdownParts = [`${p}P`, `${a}A`];
    if (l > 0) breakdownParts.push(`${l}L`);

    const rateCell = `
      <div class="att-rate-pct" style="color:${rateColor}">${pct}%</div>
      <div class="att-rate-bar-wrap">
        <div class="att-rate-bar-fill" style="width:${pct}%;background:${rateColor}"></div>
      </div>
      <div class="att-rate-breakdown">${breakdownParts.join(' · ')}</div>`;

    // Per-date cells
    // Per-date cells
    const cells = dates.map((d, ci) => {
  // Always use nameKey for consistent merged lookup
  const lookupKey = `${nameKey}|${d}`;

      const status = excelState.pendingChanges[lookupKey] !== undefined
        ? excelState.pendingChanges[lookupKey]
        : lookup[lookupKey];

      const s = cellStyle(status);
      const label = status === 'present' ? 'Present'
        : status === 'absent'  ? 'Absent'
        : status === 'late'    ? 'Late'
        : status === 'na'      ? 'N/A'
        : '—';

      const hasPending = excelState.pendingChanges[lookupKey] !== undefined;
      const pendingDot = hasPending
        ? `<span style="position:absolute;top:5px;right:5px;width:6px;height:6px;
                        border-radius:50%;background:#f59e0b;pointer-events:none"></span>`
        : '';

      const editableClass = isEdit ? ' editable' : '';

      return `
        <td class="att-td-cell" style="background:${evenBg}">
          <div class="att-cell-inner${editableClass}"
            style="background:${s.bg};color:${s.color};height:52px;position:relative;"
            ${isEdit ? `data-key="${escapeHTML(lookupKey)}" data-status="${status || 'na'}"` : ''}>
            ${label}
            ${pendingDot}
          </div>
        </td>`;
    }).join('');
    return `
      <tr data-search="${escapeHTML((st.name + ' ' + st.email).toLowerCase())}"
          style="background:${evenBg}">
        <td class="att-td-student" style="background:${evenBg}">
          <div class="att-td-student-inner">
            <div class="att-avatar" style="background:${av.bg};color:${av.text}">
              ${initL}
            </div>
            <div style="min-width:0;flex:1">
              ${isEdit ? (() => {
                const isUnlinked = !st.email || st.email.startsWith('import_');
                const enrolled   = excelState.enrolledStudents;
                const opts = enrolled.map(s =>
                  `<option value="${escapeHTML(s.email)}"
                    ${s.email === st.email ? 'selected' : ''}>
                    ${escapeHTML(s.name)} — ${escapeHTML(s.email)}
                  </option>`
                ).join('');
                return `
                  <input
                    class="att-name-edit"
                    data-orig-email="${escapeHTML(st.email)}"
                    data-orig-name="${escapeHTML(st.name)}"
                    value="${escapeHTML(st.name)}"
                    placeholder="Student name"
                    style="width:100%;padding:3px 6px;border:1.5px solid rgba(79,172,254,.3);
                           border-radius:5px;background:rgba(79,172,254,.08);color:#e8f2ff;
                           font-size:12px;font-weight:600;outline:none;margin-bottom:4px;
                           box-sizing:border-box"
                  />
                  <div style="position:relative">
                    <select
                      class="att-email-edit"
                      data-orig-email="${escapeHTML(st.email)}"
                      style="width:100%;padding:3px 6px;border:1.5px solid ${isUnlinked ? 'rgba(245,158,11,.4)' : 'rgba(79,172,254,.2)'};
                             border-radius:5px;background:${isUnlinked ? 'rgba(245,158,11,.08)' : 'rgba(79,172,254,.05)'};
                             color:${isUnlinked ? '#f59e0b' : 'rgba(79,172,254,.8)'};
                             font-size:10px;font-family:monospace;outline:none;
                             box-sizing:border-box;cursor:pointer;appearance:auto">
                      <option value="">— Keep unlinked —</option>
                      ${opts}
                    </select>
                  </div>
                  <button class="att-delete-student-btn"
                    data-student-name="${escapeHTML(st.name)}"
                    data-student-email="${escapeHTML(st.email)}"
                    title="Delete all records for ${escapeHTML(st.name)}"
                    style="margin-top:5px;width:100%;padding:3px 6px;border-radius:5px;
                           border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.1);
                           color:#f87171;font-size:10px;font-weight:700;cursor:pointer;
                           transition:all .15s;text-align:center"
                    onmouseover="this.style.background='rgba(239,68,68,.25)';this.style.color='#fff'"
                    onmouseout="this.style.background='rgba(239,68,68,.1)';this.style.color='#f87171'">
                    🗑 Delete Student
                  </button>`;
              })() : `
                <div class="att-student-name">${escapeHTML(st.name)}</div>
                <div class="att-student-email" style="${!st.email || st.email.startsWith('import_') ? 'color:#f59e0b;font-style:italic' : ''}">
                  ${!st.email || st.email.startsWith('import_') ? '⚠ unlinked' : escapeHTML(st.email)}
                </div>
              `}
            </div>
          </div>
        </td>
        <td class="att-td-rate" style="background:${evenBg}">
          ${rateCell}
        </td>
        ${cells}
      </tr>`;
  }).join('');

  // ── Legend ───────────────────────────────────────────────────────
  const legend = `
    <div class="att-legend">
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:#d1fae5;border-color:#6ee7b7"></div>
        <span>Present</span>
      </div>
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:#fee2e2;border-color:#fca5a5"></div>
        <span>Absent</span>
      </div>
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:#fef9c3;border-color:#fde68a"></div>
        <span>Late</span>
      </div>
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:rgba(100,116,139,.12);border-color:rgba(100,116,139,.2)"></div>
        <span>N/A</span>
      </div>
      <div class="att-legend-item">
        <div class="att-legend-dot" style="background:#f1f5f9;border-color:#e2e8f0"></div>
        <span>—</span>
      </div>
      ${isEdit ? `<div class="att-legend-item" style="margin-left:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block"></span>
        <span>Unsaved change · Click cell to cycle: Present → Absent → Late → N/A → Present</span>
      </div>` : ''}
    </div>`;

  // ── Assemble ─────────────────────────────────────────────────────
  wrap.innerHTML = `
    ${legend}
    <div class="att-table-wrap">
      <table id="excelTable">
        <thead>
          <tr>
            <th class="att-th-student">Student</th>
            <th class="att-th-rate">Rate</th>
            ${colHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // ── Attach click listeners for edit mode ──────────────────────────
  // ── Attach click listeners for edit mode ──────────────────────────
  if (isEdit) {
    // Cell toggle clicks
    wrap.querySelectorAll('.att-cell-inner.editable').forEach(cell => {
      cell.addEventListener('click', () => {
        const key = cell.dataset.key;
        const cur = excelState.pendingChanges[key] !== undefined
          ? excelState.pendingChanges[key]
          : (cell.dataset.status || null);
        const next = statusCycle(cur);

        excelState.pendingChanges[key] = next;

        const s = cellStyle(next);
        cell.style.background = s.bg;
        cell.style.color      = s.color;

        const labelMap = {
          present: 'Present',
          absent:  'Absent',
          late:    'Late',
          na:      'N/A',
        };
        cell.innerHTML = labelMap[next] || '—';

        const dot = document.createElement('span');
        dot.style.cssText = 'position:absolute;top:5px;right:5px;width:6px;height:6px;' +
          'border-radius:50%;background:#f59e0b;pointer-events:none';
        cell.appendChild(dot);
        cell.dataset.status = next;

        cell.style.outline = '2px solid #f59e0b';
        cell.style.outlineOffset = '-2px';
        setTimeout(() => { cell.style.outline = ''; cell.style.outlineOffset = ''; }, 500);
      });
    });

    // ── Delete DATE column ──────────────────────────────────────────
    wrap.querySelectorAll('.att-delete-date-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const dateStr = btn.dataset.date;

        // Count how many records will be deleted
        const affected = excelState.allRecords.filter(r => {
          const ts = r.marked_at || r.created_at;
          return toDisplayDate(ts) === dateStr;
        });

        if (affected.length === 0) {
          showToast('No records found for this date.', 'info');
          return;
        }

        // Warning confirm
        const confirmed = await showConfirm(
          `Delete ALL ${affected.length} attendance record(s) for ${dateStr}?\n\nThis will permanently remove every student's record on this date and cannot be undone.`
        );
        if (!confirmed) return;

        btn.disabled    = true;
        btn.textContent = '…';

        let deleted = 0, failed = 0;
        for (const r of affected) {
          try {
            await apiFetch(`/api/attendance/${r.id}`, {
              method:  'DELETE',
              headers: { 'Content-Type': 'application/json' },
            });
            deleted++;
          } catch {
            failed++;
          }
        }

        // Remove from local state
        excelState.allRecords = excelState.allRecords.filter(r => {
          const ts = r.marked_at || r.created_at;
          return toDisplayDate(ts) !== dateStr;
        });

        // Refresh grid
        const wrap2 = document.getElementById('attendanceTableWrap');
        if (wrap2) wrap2.dataset.records = JSON.stringify(excelState.allRecords);

        if (excelState.allRecords.length === 0) {
          buildStatsRow([]);
          renderEmptyAttendanceTable();
        } else {
          rerenderGrid();
        }

        if (failed === 0) {
          showToast(`Deleted ${deleted} record(s) for ${dateStr}.`, 'success');
        } else {
          showToast(`${deleted} deleted, ${failed} failed.`, 'info');
        }
      });
    });

    // ── Delete STUDENT (all their records) ──────────────────────────
    wrap.querySelectorAll('.att-delete-student-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const studentName  = btn.dataset.studentName;
        const studentEmail = btn.dataset.studentEmail;

        // Match by email if real, otherwise by name
        const affected = excelState.allRecords.filter(r => {
          if (isRealEmail(studentEmail)) {
            return r.student_email === studentEmail;
          }
          return (r.student_name || '').toLowerCase().trim() ===
                 (studentName || '').toLowerCase().trim();
        });

        if (affected.length === 0) {
          showToast('No records found for this student.', 'info');
          return;
        }

        // Warning confirm
        const confirmed = await showConfirm(
          `Delete ALL ${affected.length} attendance record(s) for "${studentName}"?\n\nThis will permanently remove every date entry for this student and cannot be undone.`
        );
        if (!confirmed) return;

        btn.disabled    = true;
        btn.textContent = '…';

        let deleted = 0, failed = 0;
        for (const r of affected) {
          try {
            await apiFetch(`/api/attendance/${r.id}`, {
              method:  'DELETE',
              headers: { 'Content-Type': 'application/json' },
            });
            deleted++;
          } catch {
            failed++;
          }
        }

        // Remove from local state
        excelState.allRecords = excelState.allRecords.filter(r => {
          if (isRealEmail(studentEmail)) {
            return r.student_email !== studentEmail;
          }
          return (r.student_name || '').toLowerCase().trim() !==
                 (studentName || '').toLowerCase().trim();
        });

        // Refresh grid
        const wrap2 = document.getElementById('attendanceTableWrap');
        if (wrap2) wrap2.dataset.records = JSON.stringify(excelState.allRecords);

        if (excelState.allRecords.length === 0) {
          buildStatsRow([]);
          renderEmptyAttendanceTable();
        } else {
          rerenderGrid();
        }

        if (failed === 0) {
          showToast(`Deleted ${deleted} record(s) for "${studentName}".`, 'success');
        } else {
          showToast(`${deleted} deleted, ${failed} failed.`, 'info');
        }
      });
    });
  }
}

// ── Save edits back to server ─────────────────────────────────────────
async function saveAttendanceChanges() {
  const changes = excelState.pendingChanges;

 // Collect student row edits (name + email)
const studentEdits = [];
document.querySelectorAll('.att-name-edit').forEach(nameInput => {
  const row          = nameInput.closest('tr');
  const emailSelect  = row ? row.querySelector('.att-email-edit') : null;
  const origEmail    = nameInput.dataset.origEmail || '';
  const origNameAttr = nameInput.dataset.origName  || '';
  const newName      = nameInput.value.trim();
  const newEmail     = emailSelect ? emailSelect.value.trim() : '';
  const selectedOption = emailSelect ? emailSelect.options[emailSelect.selectedIndex] : null;
  const linkedName   = selectedOption && newEmail
    ? selectedOption.text.split(' — ')[0].trim()
    : null;

  // Find affected records — by email for linked, by name for unlinked
  const affected = excelState.allRecords.filter(r => {
    const recName  = (r.student_name  || '').toLowerCase().trim();
    const recEmail = (r.student_email || '').toLowerCase().trim();
    if (isRealEmail(origEmail)) {
      return recEmail === origEmail.toLowerCase().trim();
    }
    return origNameAttr && recName === origNameAttr.toLowerCase().trim();
  });

  if (affected.length === 0) return;

  const displayName   = affected[0].student_name || origNameAttr;
  const storedEmail   = (affected[0].student_email || '').trim().toLowerCase();
  const incomingEmail = newEmail.trim().toLowerCase();

  const hasNameChange  = newName.trim() !== displayName.trim();
  const hasEmailChange = incomingEmail !== '' && incomingEmail !== storedEmail;

  if (hasNameChange || hasEmailChange) {
    studentEdits.push({
      origEmail,
      newName:  linkedName || newName || displayName,
      newEmail: newEmail || null,
      affected,
    });
  }
});

  if (Object.keys(changes).length === 0 && studentEdits.length === 0) {
    showToast('No changes to save.', 'info');
    excelState.isEditMode = false;
    syncEditModeUI();
    rerenderGrid();
    return;
  }

  const saveBtn = document.getElementById('attSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  let saved = 0, failed = 0;

  // ── Save status cell changes ──────────────────────────────────────
  for (const [key, newStatus] of Object.entries(changes)) {
    const pipeIdx = key.lastIndexOf('|');
    const nameKey = key.slice(0, pipeIdx);   // FIX 1: was misleadingly named `email`
    const dateStr = key.slice(pipeIdx + 1);

    try {
      const matchDate = (r) => {
        const ts = r.marked_at || r.created_at;
        if (!ts) return false;
        const d = new Date(ts);
        return toDisplayDate(d) === dateStr;
      };

      const record = excelState.allRecords.find(r => {
        if (!matchDate(r)) return false;
        return (r.student_name || '').toLowerCase().trim() === nameKey.toLowerCase().trim();
      });

      if (record) {
        if (newStatus === 'na') {
          await apiFetch(`/api/attendance/${record.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          });
          const idx = excelState.allRecords.findIndex(r => r.id === record.id);
          if (idx !== -1) excelState.allRecords.splice(idx, 1);
        } else {
          await apiFetch(`/api/attendance/${record.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          });
          record.status = newStatus;
        }
        saved++;
      } else {
        if (newStatus === 'na') {
          saved++; // nothing to do
        } else {
          const anyRecord = excelState.allRecords.find(r =>
            (r.student_name || '').toLowerCase().trim() === nameKey.toLowerCase().trim()
          );
          const studentName  = anyRecord?.student_name || nameKey;
          const studentEmail = isRealEmail(anyRecord?.student_email)
            ? anyRecord.student_email
            : null;

          const newRecord = await apiFetch('/api/attendance/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              classId:     excelState.classRef.id,
              subjectId:   excelState.subjectRef.id,
              studentName,
              studentEmail,
              date:        dateStr,
              status:      newStatus,
              room:        excelState.subjectRef.room || '',
              startTime:   excelState.subjectRef.start_time || '',
              endTime:     excelState.subjectRef.end_time || '',
            }),
          });
          if (newRecord?.record) excelState.allRecords.push(newRecord.record);
          saved++;
        }
      }
    } catch (e) {
      console.warn('Failed to save status change:', email, dateStr, e.message);
      failed++;
    }
  }

  // ── Save student name/email edits ─────────────────────────────────
  for (const edit of studentEdits) {
    try {
      await apiFetch('/api/attendance/update-student', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origEmail:  edit.origEmail,
          newName:    edit.newName,
          newEmail:   edit.newEmail,
          recordIds:  edit.affected.map(r => r.id),
        }),
      });
      edit.affected.forEach(r => {
        r.student_name = edit.newName;
        if (edit.newEmail) {
          r.student_email = edit.newEmail;
        }
      });
      saved++;
    } catch (e) {
      console.warn('Failed to save student edit:', edit, e.message);
      failed++;
    }
  }

  // ── Finish ────────────────────────────────────────────────────────
  const wrap = document.getElementById('attendanceTableWrap');
  if (wrap) wrap.dataset.records = JSON.stringify(excelState.allRecords);

  excelState.isEditMode     = false;
  excelState.pendingChanges = {};
  syncEditModeUI();
  rerenderGrid();

  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }

  if (failed === 0) {
    showToast(saved > 0 ? `${saved} change(s) saved!` : 'No changes to save.', saved > 0 ? 'success' : 'info');
  } else {
    showToast(`${saved} saved, ${failed} failed.`, 'info');
  }
}

// ── Export CSV ────────────────────────────────────────────────────────
function exportAttendanceCSV(cls, subject) {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap?.dataset.records) { showToast('No records to export', 'error'); return; }

  let records = JSON.parse(wrap.dataset.records);
const dateFrom = document.getElementById('attDateFrom')?.value;
  const dateTo   = document.getElementById('attDateTo')?.value;
  const fromTs   = dateFrom ? new Date(dateFrom + 'T00:00:00Z').getTime() : null;
  const toTs     = dateTo   ? new Date(dateTo   + 'T23:59:59Z').getTime() : null;

  if (fromTs || toTs) {
    records = records.filter(r => {
      const ts = r.marked_at || r.created_at;
      if (!ts) return false;
      const d   = new Date(ts);
      const rec = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (fromTs && rec < fromTs) return false;
      if (toTs   && rec > toTs)   return false;
      return true;
    });
  }

  if (records.length === 0) {
    showToast('No records to export', 'error'); return;
  }

  // ── Build pivot exactly like renderAttendanceTable does ───────────
  const studentMap = new Map();
  const dateSet    = new Set();

  records.forEach(r => {
    const ts      = r.marked_at || r.created_at;
    const dStr    = toDisplayDate(ts);  // "May 1, 2025"
    const nameKey = (r.student_name || '').toLowerCase().trim();
    if (!nameKey || !dStr) return;

    if (!studentMap.has(nameKey)) {
      studentMap.set(nameKey, {
        name:  r.student_name,
        email: r.student_email || '',
      });
    }

    const entry = studentMap.get(nameKey);
    if (isRealEmail(r.student_email) && !isRealEmail(entry.email)) {
      entry.email = r.student_email;
    }

    dateSet.add(dStr);
  });

  // ── Sort dates chronologically using the same display strings ─────
  const dates = [...dateSet].sort((a, b) => {
    return new Date(a).getTime() - new Date(b).getTime();
  });

  // ── Sort students alphabetically ──────────────────────────────────
  const students = [...studentMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // ── Build lookup: "nameKey|dStr" → status ─────────────────────────
  const lookup = {};
  records.forEach(r => {
    const ts      = r.marked_at || r.created_at;
    const dStr    = toDisplayDate(ts);
    const nameKey = (r.student_name || '').toLowerCase().trim();
    if (!dStr || !nameKey) return;
    const key = `${nameKey}|${dStr}`;
    // Don't overwrite a real status with a weaker one
    if (!lookup[key] || lookup[key] === 'na') {
      lookup[key] = r.status;
    }
  });

  // ── Build CSV ─────────────────────────────────────────────────────
  const headerRow = [
    'Student Name',
    'Email',
    ...dates,
    'Present',
    'Absent',
    'Late',
    'Attendance Rate',
  ];

  const dataRows = students.map(st => {
    const nameKey = st.name.toLowerCase().trim();
    let p = 0, a = 0, l = 0;

    const cells = dates.map(d => {
      const status = lookup[`${nameKey}|${d}`];
      if (status === 'present') p++;
      else if (status === 'absent') a++;
      else if (status === 'late') l++;

      if (!status || status === 'na') return '—';
      return status.charAt(0).toUpperCase() + status.slice(1);
    });

    const total = p + a + l;
    const pct   = total ? Math.round((p / total) * 100) + '%' : '—';

    return [st.name, st.email || '—', ...cells, p, a, l, pct];
  });

  // ── Serialize to CSV string ───────────────────────────────────────
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headerRow.map(escape).join(','),
    ...dataRows.map(row => row.map(escape).join(',')),
  ].join('\n');

  // ── Trigger download ──────────────────────────────────────────────
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${cls.class_name}_${subject.subject}_attendance.csv`
    .replace(/[^a-z0-9_\-\.]/gi, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast('CSV exported!', 'success');
}

// Timer control functions
function toggleTimerPause(classId) {
  if (!state.activeTimers[classId]) return;
  
  const timer = state.activeTimers[classId];
  const pauseBtn = document.getElementById(`timer-pause-${classId}`);
  const timerDisplay = document.getElementById(`timer-display-${classId}`);
  
  timer.isPaused = !timer.isPaused;
  
  if (timer.isPaused) {
    pauseBtn.textContent = '▶ Resume';
    pauseBtn.style.background = 'rgba(30,64,175,0.2)';
    if (timerDisplay) timerDisplay.style.opacity = '0.5';
  } else {
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.style.background = 'rgba(30,64,175,0.1)';
    if (timerDisplay) timerDisplay.style.opacity = '1';
  }
}

async function stopTimer(classId) {
  if (!state.activeTimers[classId]) return;

  clearInterval(state.activeTimers[classId].intervalId);
  delete state.activeTimers[classId];

  const timerSection = document.getElementById(`timer-section-${classId}`);
  if (timerSection) timerSection.style.display = 'none';

  // Clear password in DB
  try {
    await apiFetch(API.updatePasscode(classId), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ passcode: null, duration: 0 }),
    });
  } catch (err) {
    console.error('Failed to clear passcode:', err);
  }

  // Mark the active session as ended
  try {
    const sessions = await apiFetch('/api/attendance-sessions');
    const active = (sessions.sessions || []).find(
      s => s.class_id == classId && s.is_active !== false
    );
    if (active) {
      await apiFetch(`/api/attendance-sessions/${active.id}/stop`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {}

  showToast('Session stopped — passcode cleared.', 'info');
  loadSessions();
}

// ===========================
// MODAL FUNCTIONS
// ===========================

function openClassModal() {
  const modal = document.getElementById('classModal');
  if (!modal) return;
  modal.style.display = 'flex';
  state.currentFormStep = 1;
  state.classSubjectsBuffer = [];
  showStep(1);
  document.getElementById('classNameInput')?.focus();
}

function hideClassModal() {
  document.getElementById('classModal').style.display = 'none';
  const inp = document.getElementById('classNameInput');
  if (inp) inp.value = '';
  state.classSubjectsBuffer = [];
  state.currentFormStep = 1;
  showStep(1);
}

function openSubjectModal() {
  if (!state.selectedClassId) { showToast('Please select a class first', 'error'); return; }
  document.getElementById('subjectModal').style.display = 'flex';
  document.getElementById('subjectNameInput')?.focus();
}

function hideSubjectModal() {
  document.getElementById('subjectModal').style.display = 'none';
  ['subjectNameInput','subjectRoomInput']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('.subjectDayCheckboxModal').forEach(cb => (cb.checked = false));
}

// ===========================
// FORM STEPS
// ===========================

function validateStep(step) {
  if (step === 1 && !document.getElementById('classNameInput')?.value.trim()) {
    showToast('Please enter a class name', 'error'); return false;
  }
  return true;
}

function showStep(step) {
  state.currentFormStep = step;
  document.querySelectorAll('.form-step').forEach(el => (el.style.display = 'none'));
  document.getElementById('step' + step).style.display = 'block';
  document.getElementById('prevBtn').style.display       = step === 1 ? 'none'  : 'block';
  document.getElementById('nextBtn').style.display       = step === 2 ? 'none'  : 'block';
  document.getElementById('addSubjectBtn').style.display = step === 2 ? 'block' : 'none';
  document.getElementById('saveBtn').style.display =
    step === 2 && state.classSubjectsBuffer.length > 0 ? 'block' : 'none';
  if (step === 2)
    document.getElementById('classNameDisplay').textContent =
      document.getElementById('classNameInput').value.trim();
  document.getElementById('formStepTitle').textContent =
    ['Create New Class', 'Add Subjects'][step - 1];
}

function nextStep()     { if (validateStep(state.currentFormStep)) showStep(state.currentFormStep + 1); }
function previousStep() { showStep(state.currentFormStep - 1); }

// ===========================
// SUBJECT BUFFER (step 2)
// ===========================

function addSubjectToClass() {
  const subjectName  = document.getElementById('subjectNameInputClass')?.value.trim();
  const startTime    = document.getElementById('subjectStartTimeClass')?.value;
  const endTime      = document.getElementById('subjectEndTimeClass')?.value;
  const room         = document.getElementById('subjectRoomInputClass')?.value.trim();
  const selectedDays = Array.from(document.querySelectorAll('.subjectDayCheckbox:checked'))
    .map(cb => cb.value).join(', ');

  if (!subjectName)  { showToast('Please enter a subject name', 'error'); return; }
  if (!selectedDays) { showToast('Please select at least one day', 'error'); return; }

  // Check for time overlaps
  if (startTime && endTime) {
    if (startTime >= endTime) {
      showToast('End time must be after start time', 'error'); return;
    }
    const allExisting = [...state.classSubjectsBuffer];
    state.classesData.forEach(cls => {
      (cls.subjects || []).forEach(s => allExisting.push({...s, className: cls.class_name}));
    });
    const overlap = checkScheduleOverlap(selectedDays, startTime, endTime, allExisting);
    if (overlap) {
      const loc = overlap.className ? `class: ${overlap.className}` : 'the pending subjects';
      showToast(`Schedule overlaps with "${overlap.subject}" in ${loc}`, 'error');
      return;
    }
  }

  // Push to buffer
  state.classSubjectsBuffer.push({
    subject:    subjectName,
    start_time: startTime || '00:00',
    end_time:   endTime   || '00:00',
    room:       room      || 'TBD',
    days:       selectedDays,
  });

  // Clear inputs for next subject
  ['subjectNameInputClass', 'subjectRoomInputClass']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('.subjectDayCheckbox').forEach(cb => (cb.checked = false));

  // Update the display list
  updateSubjectsDisplay();

  // Refocus name input (NOT the add button, which triggered double-submit)
  document.getElementById('subjectNameInputClass')?.focus();

  showToast(`"${subjectName}" added. Add another or click Save Class.`, 'success');
}

function updateSubjectsDisplay() {
  const container = document.getElementById('subjectsAddedContainer');
  const list      = document.getElementById('subjectsAddedList');

  if (state.classSubjectsBuffer.length > 0) {
    container.style.display = 'block';
    list.innerHTML = state.classSubjectsBuffer.map((s, i) => `
      <div style="padding:8px;background:rgba(255,255,255,0.05);border-radius:4px;margin-bottom:6px;
                  display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:12px">
          <strong>${escapeHTML(s.subject)}</strong><br>
          <span style="color:var(--ink4)">${escapeHTML(s.start_time)} – ${escapeHTML(s.end_time)} · ${escapeHTML(s.room)}</span><br>
          <span style="color:var(--ink5);font-size:11px">Days: ${escapeHTML(s.days)}</span>
        </div>
        <button type="button" data-action="remove-subject-buffer" data-index="${i}"
          style="border:none;background:none;color:#ff6b6b;cursor:pointer;font-size:16px">×</button>
      </div>`).join('');

    list.querySelectorAll('[data-action="remove-subject-buffer"]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.classSubjectsBuffer.splice(Number(btn.dataset.index), 1);
        updateSubjectsDisplay();
      });
    });
  } else {
    container.style.display = 'none';
  }

  // Always show Add Subject button on step 2; show Save only when buffer has items
  document.getElementById('addSubjectBtn').style.display = 'block';
  document.getElementById('saveBtn').style.display =
    state.classSubjectsBuffer.length > 0 ? 'block' : 'none';
}

// ===========================
// CLASS CRUD
// ===========================

async function submitClassForm() {
  const className = document.getElementById('classNameInput')?.value.trim();
  if (!className) { showToast('Please enter a class name', 'error'); return; }
  if (state.classSubjectsBuffer.length === 0) { showToast('Please add at least one subject', 'error'); return; }

  // Snapshot the buffer BEFORE hiding the modal (which clears it)
  const subjectsToSave = [...state.classSubjectsBuffer];

  const saveBtn = document.getElementById('saveBtn');
  await withLoading(saveBtn, 'Saving...', async () => {
    try {
      const classData = await apiFetch(API.addClass, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_name: className }),
      });
      if (!classData.success) throw new Error(classData.error || 'Failed to create class');

      // Use the snapshot, not state.classSubjectsBuffer
      const subjectData = await apiFetch(API.addSubjects(classData.class_id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjects: subjectsToSave }),
      });
      if (!subjectData.success) throw new Error(subjectData.error || 'Failed to add subjects');

      hideClassModal(); // safe to clear now
      await loadClasses();
      showToast(`Class created with ${subjectsToSave.length} subject(s)!`, 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

/**
 * Loads all classes AND eagerly fetches subjects for each.
 * This is what makes the sidebar show subjects immediately — no click required.
 */
async function loadClasses() {
  const classList = document.getElementById('classList');
  if (!classList) return;
  classList.innerHTML = '<div class="class-item" style="cursor:default;color:var(--ink4)">Loading...</div>';

  try {
    const data = await apiFetch(API.teacherClasses);
    state.classesData = data.classes || [];

    if (state.classesData.length === 0) {
      classList.innerHTML = '<div class="class-item" style="cursor:default">No classes yet. Create one to begin.</div>';
      renderSidebarClasses();
      return;
    }

    // ── Eagerly fetch subjects for every class in parallel ──
    await Promise.all(
      state.classesData.map(async (cls) => {
        try {
          const res = await apiFetch(API.classSubjects(cls.id));
          cls.subjects = res.subjects || [];
        } catch {
          cls.subjects = [];
        }
      })
    );

    classList.innerHTML = state.classesData.map(c => `
  <div class="class-item" data-class-id="${c.id}" style="padding:0;border:none;background:none;margin-bottom:12px">
    <div style="display:flex;gap:8px;align-items:stretch">
      <!-- Class toggle -->
      <button class="class-toggle-btn" data-class-id="${c.id}"
        style="flex:1;display:flex;align-items:center;gap:10px;padding:12px 16px;
               background:var(--blue-500,#055be8);border:none;border-radius:8px;cursor:pointer;
               font-weight:600;color:#fff;transition:all .2s;text-align:left">
        <span style="flex:1">
          <div>${escapeHTML(c.class_name)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:400">${(c.subjects || []).length} subject(s)</div>
        </span>
        <span class="class-chevron" style="font-size:16px;color:rgba(255,255,255,0.7);transition:transform .2s">▼</span>
      </button>
      <!-- Delete class button -->
      <button type="button"
        data-action="delete-class"
        data-class-id="${c.id}"
        style="border:none;background:transparent;color:var(--ink6, #94a3b8);cursor:pointer;
               width:42px;border-radius:8px;display:flex;align-items:center;
               justify-content:center;font-size:16px;flex-shrink:0;transition:all .2s;opacity:0.6;"
        onmouseover="this.style.background='#fee2e2'; this.style.color='#dc2626'; this.style.opacity='1';"
        onmouseout="this.style.background='transparent'; this.style.color='var(--ink6, #94a3b8)'; this.style.opacity='0.6';"
        title="Delete class">🗑</button>
    </div>

    <!-- Subjects list -->
    <div class="class-subjects-wrapper" data-class-id="${c.id}"
         style="display:none;padding:10px 0 4px 12px;margin-top:4px">

      <!-- Timer section -->
      <div id="timer-section-${c.id}"
           style="display:none;margin-bottom:12px;padding:12px;border-radius:8px;
                  background:linear-gradient(135deg,#f0f4ff,#eff6ff);border:1px solid #bfdbfe;
                  align-items:center;gap:12px">
        <div style="flex:1">
          <div style="font-size:11px;font-weight:700;color:#1E40AF;text-transform:uppercase;letter-spacing:.5px">Passcode Active</div>
          <div id="timer-display-${c.id}" style="font-family:monospace;font-size:24px;font-weight:700;color:#1E40AF;margin-top:4px">00:00</div>
        </div>
        <div style="display:flex;gap:6px;flex-direction:column">
          <button id="timer-pause-${c.id}"
            style="padding:6px 10px;border-radius:6px;border:1px solid rgba(30,64,175,0.3);
                   background:rgba(30,64,175,0.1);color:#1E40AF;cursor:pointer;font-size:11px;
                   font-weight:600;display:flex;align-items:center;gap:4px"
            onclick="toggleTimerPause(${c.id})">⏸ Pause</button>
          <button
            style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,107,107,0.3);
                   background:rgba(255,107,107,0.1);color:#ff6b6b;cursor:pointer;font-size:11px;
                   font-weight:600;display:flex;align-items:center;gap:4px"
            onclick="stopTimer(${c.id})">⏹ Stop</button>
        </div>
      </div>

      ${(c.subjects || []).length === 0
        ? `<div style="font-size:12px;color:var(--ink5);padding:8px 4px">No subjects yet.</div>`
        : (c.subjects || []).map(s => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:10px;
                      background:var(--surface2,#f8fafc);border-radius:8px;
                      border:1px solid var(--border,rgba(15,23,42,.08))">
            <!-- Subject name / view attendance -->
            <button
              style="flex:1;border:none;background:none;cursor:pointer;text-align:left;
                     padding:0;color:var(--ink2);font-size:13px;font-weight:500"
              onclick="openAttendanceView(
                {id:${c.id}, class_name:'${escapeHTML(c.class_name).replace(/'/g,"\\'")}'},
                {id:${s.id}, subject:'${escapeHTML(s.subject).replace(/'/g,"\\'")}',
                 start_time:'${s.start_time || ""}', end_time:'${s.end_time || ""}',
                 room:'${(s.room || "").replace(/'/g,"\\'")}'}
              )">
              <div style="display:flex;align-items:center;gap:7px">
                <span style="width:6px;height:6px;border-radius:50%;
                             background:rgba(99,153,255,0.8);flex-shrink:0"></span>
                <span>${escapeHTML(s.subject)}</span>
              </div>
              <div style="font-size:11px;color:var(--ink5);margin-top:2px;padding-left:13px">
                ${s.start_time ? s.start_time.substring(0,5) : ''}${s.end_time ? '–'+s.end_time.substring(0,5) : ''}
                ${s.room ? ' · ' + escapeHTML(s.room) : ''}
                ${s.days ? ' · ' + escapeHTML(s.days) : ''}
              </div>
            </button>
            <!-- Delete subject button -->
            <button type="button"
              data-action="delete-subject"
              data-class-id="${c.id}"
              data-subject-id="${s.id}"
              style="flex-shrink:0;width:32px;height:32px;border-radius:6px;
                     border:none;background:transparent;color:var(--ink5, #64748b);
                     cursor:pointer;display:grid;place-items:center;transition:all .15s;opacity:0.6"
              onmouseover="this.style.background='#fee2e2'; this.style.color='#dc2626'; this.style.opacity='1'"
              onmouseout="this.style.background='transparent'; this.style.color='var(--ink5, #64748b)'; this.style.opacity='0.6'"
              title="Delete subject">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>`).join('')
      }

      <!-- Add Subject -->
      <button type="button"
        style="width:100%;margin-top:4px;padding:8px 12px;border-radius:6px;
               border:1px dashed rgba(99,153,255,0.35);background:none;
               color:rgba(99,153,255,0.8);cursor:pointer;font-size:12px;font-weight:600;
               display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s"
        onclick="state.selectedClassId=${c.id}; selectClass(${c.id}); openSubjectModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Add Subject
      </button>
    </div>
  </div>`).join('');

    // Add toggle functionality
    document.querySelectorAll('.class-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const classId = btn.dataset.classId;
        const wrapper = document.querySelector(`.class-subjects-wrapper[data-class-id="${classId}"]`);
        const chevron = btn.querySelector('.class-chevron');
        const isOpen = wrapper.style.display !== 'none';
        wrapper.style.display = isOpen ? 'none' : 'block';
        chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      });
    });
    
    renderSidebarClasses();
  renderTeacherTodayClasses();

  } catch (err) {
    classList.innerHTML = `<div class="class-item" style="cursor:default;color:#ef4444">Error: ${escapeHTML(err.message)}</div>`;
  }
}

function renderTeacherTodayClasses() {
  const container = document.getElementById('todayClassList');
  if (!container) return;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayDow = dayNames[new Date().getDay()];

  let todaySubjects = [];
  state.classesData.forEach(cls => {
    (cls.subjects || []).forEach(sub => {
      const days = Array.isArray(sub.days) ? sub.days : (sub.days || '').split(',').map(d => d.trim()).filter(Boolean);
      if (days.includes(todayDow)) {
        todaySubjects.push({
          classId: cls.id,
          className: cls.class_name,
          subjectId: sub.id,
          subjectName: sub.subject,
          startTime: sub.start_time,
          endTime: sub.end_time,
          room: sub.room || 'TBA',
          timeRange: fmtTimeRange(sub.start_time, sub.end_time)
        });
      }
    });
  });

  if (todaySubjects.length === 0) {
    container.innerHTML = '<div style="padding:30px 20px;text-align:center;color:var(--ink5);font-size:13px">No classes scheduled for today. 🎉</div>';
    return;
  }

  // I-sort base sa oras (Start Time)
  todaySubjects.sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));

  container.innerHTML = todaySubjects.map((s, index) => {
    const borderStyle = index === todaySubjects.length - 1 ? '' : 'border-bottom:1px solid var(--border);';
    const clsStr = JSON.stringify({id: s.classId, class_name: s.className}).replace(/"/g, '&quot;');
    const subjStr = JSON.stringify({id: s.subjectId, subject: s.subjectName, start_time: s.startTime||'', end_time: s.endTime||'', room: s.room||''}).replace(/"/g, '&quot;');
    
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;${borderStyle}transition:background 0.2s"
           onmouseover="this.style.background='var(--surface2, #f8fafc)'" onmouseout="this.style.background='transparent'">
        <div style="min-width:0;display:flex;align-items:center;gap:12px">
          <div style="width:4px;height:36px;border-radius:99px;background:var(--accent,#1E40AF)"></div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(s.subjectName)}</div>
            <div style="font-size:12px;color:var(--ink5);margin-top:2px">${escapeHTML(s.className)} · ${s.timeRange} · ${escapeHTML(s.room)}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="openAttendanceView(${clsStr}, ${subjStr})" style="flex-shrink:0;padding:6px 12px;border:1px solid var(--border2);background:var(--surface2);color:var(--ink3);border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s" onmouseover="this.style.background='var(--surface)';this.style.borderColor='var(--border)'" onmouseout="this.style.background='var(--surface2)';this.style.borderColor='var(--border2)'" title="View Attendance Records">👁️ View</button>
          <button onclick="startSubjectSession(${s.classId}, '${escapeHTML(s.className).replace(/'/g,"\\'")}', ${s.subjectId}, '${escapeHTML(s.subjectName).replace(/'/g,"\\'")}')" style="flex-shrink:0;padding:6px 12px;border:none;background:#10b981;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;transition:background 0.2s" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">▶ Start</button>
        </div>
      </div>`;
  }).join('');
}

function selectClass(classId) {
  state.selectedClassId = classId;
  const cls = state.classesData.find(c => c.id === classId);
  if (cls) {
    const cName = document.getElementById('selectedClassName');
    if (cName) cName.textContent = escapeHTML(cls.class_name);
    const cMeta = document.getElementById('selectedClassMeta');
    if (cMeta) cMeta.textContent = cls.schedule ? `Days: ${cls.schedule}` : '';
    const cInfo = document.getElementById('selectedClassInfo');
    if (cInfo) cInfo.style.display = 'flex';
    // Subjects are already loaded; just update the inline container display
    toggleClassSubjects(classId);
  }
}

async function loadClassSubjects(classId) {
  try {
    const data = await apiFetch(API.classSubjects(classId));
    const cls  = state.classesData.find(c => c.id === classId);
    if (cls) { cls.subjects = data.subjects || []; renderSidebarClasses(); }
    await loadClasses(); // full refresh to keep main list in sync
  } catch {}
}

function toggleClassSubjects(classId) {
  const classItem = document.querySelector(`[data-class-id="${classId}"]`);
  const sub = classItem?.querySelector('.class-subjects');
  if (sub) sub.style.display = sub.style.display === 'none' ? 'block' : 'none';
}

async function deleteClass(classId) {
  if (!await showConfirm('Delete this class and all its subjects? This cannot be undone.')) return;
  try {
    const data = await apiFetch(API.deleteClass(classId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!data.success) throw new Error(data.error || 'Failed to delete class');
    state.selectedClassId = null;
    const cInfo = document.getElementById('selectedClassInfo');
    if (cInfo) cInfo.style.display = 'none';
    await loadClasses();
    showToast('Class deleted.', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===========================
// SUBJECT CRUD
// ===========================

async function submitSubjectForm() {
  const subjectName = document.getElementById('subjectNameInput')?.value.trim();
  const startTime   = document.getElementById('subjectStartTime')?.value;
  const endTime     = document.getElementById('subjectEndTime')?.value;
  const room        = document.getElementById('subjectRoomInput')?.value.trim();
  const selectedDays = Array.from(document.querySelectorAll('.subjectDayCheckboxModal:checked'))
    .map(cb => cb.value).join(', ');
  
  if (!subjectName) { showToast('Please enter a subject name', 'error'); return; }
  if (!selectedDays) { showToast('Please select at least one day', 'error'); return; }
  
  // Check for time overlaps
  if (startTime && endTime) {
    if (startTime >= endTime) {
      showToast('End time must be after start time', 'error'); return;
    }
    const allExisting = [];
    state.classesData.forEach(cls => {
      (cls.subjects || []).forEach(s => allExisting.push({...s, className: cls.class_name}));
    });
    const overlap = checkScheduleOverlap(selectedDays, startTime, endTime, allExisting);
    if (overlap) {
      showToast(`Schedule overlaps with "${overlap.subject}" in class: ${overlap.className || 'Unknown'}`, 'error');
      return;
    }
  }

  const btn = document.querySelector('#subjectModal .btn-primary');
  await withLoading(btn, 'Saving...', async () => {
    const data = await apiFetch(API.addSubjects(state.selectedClassId), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjects: [{ subject: subjectName, start_time: startTime || '00:00', end_time: endTime || '00:00', room: room || 'TBD', days: selectedDays }] }),
    });
    if (!data.success) throw new Error(data.error || 'Failed to add subject');
    hideSubjectModal();
    await loadClassSubjects(state.selectedClassId);
    showToast('Subject added!', 'success');
  });
}

async function deleteSubject(classId, subjectId) {
  if (!await showConfirm('Delete this subject? This cannot be undone.')) return;
  try {
    const data = await apiFetch(API.deleteSubject(classId, subjectId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!data.success) throw new Error(data.error || 'Failed to delete subject');
    await loadClassSubjects(classId);
    showToast('Subject deleted.', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===========================
// ATTENDANCE SESSION
// ===========================

function openPasscodeModal() {
  if (!state.selectedClassId) { 
    showToast('Please select a class first', 'error'); 
    return; 
  }
  document.getElementById('passcodeInput').value = '';
  document.getElementById('passcodeModal').style.display = 'flex';
}

function closePasscodeModal() {
  document.getElementById('passcodeModal').style.display = 'none';
}

async function submitPasscodeForm() {
  const passcode = document.getElementById('passcodeInput').value.trim();
  closePasscodeModal();
  
  const selectedClass = state.classesData.find(c => c.id === state.selectedClassId);
  if (!selectedClass) { showToast('Class not found', 'error'); return; }

  try {
    const data = await apiFetch('/api/start-attendance-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_name: selectedClass.class_name,
        class_id: state.selectedClassId,
        session_password: passcode || null
      })
    });
    
    showToast('Attendance session started!', 'success');
    
    // Start timer
    startSessionTimer(state.selectedClassId);
    loadSessions();
  } catch (error) {
    showToast('Failed to start session: ' + error.message, 'error');
  }
}

function startSessionTimer(classId) {
  // Clear any existing timer
  if (state.activeTimers[classId]) {
    clearInterval(state.activeTimers[classId].intervalId);
  }

  let seconds = 0;
  const timerDisplay = document.getElementById('sessionTimerDisplay');
  const timerText = document.getElementById('timerText');
  
  timerDisplay.style.display = 'block';

  const intervalId = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    timerText.textContent = timeStr;
  }, 1000);

  state.activeTimers[classId] = {
    intervalId: intervalId,
    startTime: Date.now(),
    seconds: seconds
  };
}

function stopSessionTimer(classId) {
  if (state.activeTimers[classId]) {
    clearInterval(state.activeTimers[classId].intervalId);
    delete state.activeTimers[classId];
    document.getElementById('sessionTimerDisplay').style.display = 'none';
    showToast('Attendance session ended', 'info');
  }
}

function endCurrentSession() {
  if (!state.selectedClassId) {
    showToast('No active session', 'error');
    return;
  }
  stopSessionTimer(state.selectedClassId);
}

async function loadSessions() {
  try {
    const data = await apiFetch('/api/attendance-sessions');
    const container = document.getElementById('sessionsContainer');

    if (!data.sessions || data.sessions.length === 0) {
      container.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:var(--ink5)">
          <div style="width:48px;height:48px;border-radius:12px;background:var(--surface2,#f8fafc);border:1px dashed var(--border2,rgba(15,23,42,.12));display:grid;place-items:center;margin:0 auto 12px;font-size:20px;color:var(--ink4)">🕒</div>
          <div style="font-size:14px;font-weight:600;color:var(--ink2)">No recent sessions</div>
          <div style="font-size:12px;margin-top:4px">Start a session from your classes to see it here.</div>
        </div>`;
      return;
    }

    container.innerHTML = data.sessions.map(session => {
      const isActive = session.is_active !== false; // treat null as active
      const className = session.class_name || `Class ${session.class_id || '—'}`;
      const created = new Date(session.created_at).toLocaleString();
      const code = session.session_password || session.session_code || '—';

      // Hanapin ang subject details para sa View button
      const cls = state.classesData.find(c => c.id === session.class_id);
      const subj = cls ? (cls.subjects || []).find(s => Math.trunc(Number(s.id)) === Math.trunc(Number(session.subject_id))) : null;
      
      let viewBtn = '';
      if (!isActive && cls && subj) {
        const clsStr = JSON.stringify({id: cls.id, class_name: cls.class_name}).replace(/"/g, '&quot;');
        const subjStr = JSON.stringify({id: subj.id, subject: subj.subject, start_time: subj.start_time||'', end_time: subj.end_time||'', room: subj.room||''}).replace(/"/g, '&quot;');
        viewBtn = `<button onclick="openAttendanceView(${clsStr}, ${subjStr})" style="flex-shrink:0;padding:6px 12px;border:1px solid var(--border2);background:var(--surface2);color:var(--ink3);border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s" onmouseover="this.style.background='var(--surface)';this.style.borderColor='var(--border)'" onmouseout="this.style.background='var(--surface2)';this.style.borderColor='var(--border2)'" title="View Attendance Records">👁️ View</button>`;
      }

      return `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border,#e2e8f0);
                    display:flex;justify-content:space-between;align-items:center;gap:10px;transition:background 0.2s"
             onmouseover="this.style.background='var(--surface2, #f8fafc)'" onmouseout="this.style.background='transparent'">
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <div style="font-weight:600;color:var(--ink0,#0f172a);
                          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${escapeHTML(className)}
              </div>
              ${isActive
                ? '<span style="padding:2px 8px;border-radius:99px;background:#dcfce7;color:#16a34a;font-size:10px;font-weight:700;flex-shrink:0">Active</span>'
                : '<span style="padding:2px 8px;border-radius:99px;background:#f1f5f9;color:#64748b;font-size:10px;font-weight:700;flex-shrink:0">Ended</span>'}
            </div>
            <div style="font-size:11px;color:var(--ink5,#64748b)">
              ${subj ? `<strong style="color:var(--ink3)">${escapeHTML(subj.subject)}</strong> · ` : ''}Code: <strong style="font-family:monospace">${escapeHTML(code)}</strong>
              · ${created}
            </div>
          </div>
          <div style="display:flex;gap:6px">
            ${isActive ? `<button onclick="endSession(${session.id}, ${session.class_id || 'null'})" style="flex-shrink:0;padding:6px 14px;border:none;background:#ef4444;color:white;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;transition:background 0.2s" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">End Session</button>` : viewBtn}
          </div>
        </div>`;
    }).join('');

  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}
async function endSession(sessionId, classId) {
  try {
    // 1. Stop session in DB — this also clears password server-side now
    await apiFetch(`/api/attendance-sessions/${sessionId}/stop`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });

    // 2. Also clear passcode via the dedicated endpoint (belt and suspenders)
    if (classId) {
      await apiFetch(API.updatePasscode(classId), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ passcode: null, duration: 0 }),
      }).catch(() => {});
    }

    // 3. Stop frontend timer if running
    if (classId && state.activeTimers[classId]) {
      clearInterval(state.activeTimers[classId].intervalId);
      delete state.activeTimers[classId];
      const timerSection = document.getElementById(`timer-section-${classId}`);
      if (timerSection) timerSection.style.display = 'none';
    }

    showToast('Session ended — passcode cleared.', 'info');
    loadSessions();
  } catch (err) {
    showToast('Failed to end session: ' + err.message, 'error');
  }
}
// ===========================
// ENROLLMENT CODE MODAL
// ===========================

function generateEnrollmentCode(subjectId) {
  // Create a unique enrollment code from subject ID
  // Use base36 encoding to make it more readable
  const code = (Math.abs(subjectId) % 999999).toString().padStart(6, '0');
  // Format as XXXX-XX for better readability
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function openEnrollmentModal(classObj, subjectObj) {
  const modal = document.getElementById('enrollmentModal');
  if (!modal) return;
  
  // Populate modal with subject and class information
  document.getElementById('enrollSubjectName').textContent = escapeHTML(subjectObj.subject);
  document.getElementById('enrollClassName').textContent = escapeHTML(classObj.class_name);
  
  // Display subject ID
  const displayId = subjectObj.id || 'N/A';
  document.getElementById('enrollSubjectId').textContent = displayId;
  
  // Generate enrollment code
  const enrollmentCode = generateEnrollmentCode(subjectObj.id);
  document.getElementById('enrollmentCode').textContent = enrollmentCode;
  
  // Setup copy buttons
  const copyIdBtn = document.getElementById('copySubjectIdBtn');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const shareBtn = document.getElementById('shareBtn');
  
  copyIdBtn.onclick = () => {
    navigator.clipboard.writeText(displayId).then(() => {
      showToast('Subject ID copied!', 'success');
      copyIdBtn.textContent = '✓';
      setTimeout(() => { copyIdBtn.textContent = '📋'; }, 2000);
    });
  };
  
  copyCodeBtn.onclick = () => {
    navigator.clipboard.writeText(enrollmentCode).then(() => {
      showToast('Enrollment code copied!', 'success');
      copyCodeBtn.textContent = '✓';
      setTimeout(() => { copyCodeBtn.textContent = '📋'; }, 2000);
    });
  };
  
  shareBtn.onclick = () => {
    const shareText = `Join our class! ${classObj.class_name} - ${subjectObj.subject}\n\nEnrollment Code: ${enrollmentCode}\nSubject ID: ${displayId}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Class Enrollment',
        text: shareText
      }).catch(err => console.log('Share cancelled:', err));
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareText).then(() => {
        showToast('Share info copied to clipboard!', 'success');
      });
    }
  };
  
  modal.style.display = 'flex';
}

function closeEnrollmentModal() {
  const modal = document.getElementById('enrollmentModal');
  if (modal) modal.style.display = 'none';
}
function startSubjectSession(classId, className, subjectId, subjectName) {
  state.selectedClassId   = classId;
  state.selectedSubjectId = subjectId;

  const existing = document.getElementById('subjectSessionModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'subjectSessionModal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(15,23,42,.75);
    backdrop-filter:blur(4px);z-index:1300;display:flex;
    align-items:center;justify-content:center;padding:20px`;

  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;padding:28px;
                max-width:420px;width:100%;position:relative;
                box-shadow:0 8px 32px rgba(0,0,0,.15)">
      <button onclick="document.getElementById('subjectSessionModal').remove()"
        style="position:absolute;top:16px;right:16px;border:none;background:none;
               font-size:20px;cursor:pointer;color:var(--ink5)">×</button>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <div style="width:38px;height:38px;border-radius:10px;background:#f0fdf4;
                    display:grid;place-items:center;flex-shrink:0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="10 8 16 12 10 16 10 8" fill="#16a34a" stroke="none"/>
          </svg>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--ink2)">Start Attendance Session</div>
          <div style="font-size:12px;color:var(--ink5)">${escapeHTML(subjectName)} · ${escapeHTML(className)}</div>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <label style="display:block;font-size:12px;font-weight:600;color:var(--ink4);margin-bottom:6px">
          Session Passcode <span style="color:#999;font-weight:400">(optional)</span>
        </label>
        <input id="subjectSessionPasscode" type="text" placeholder="e.g. 1234"
          style="width:100%;padding:10px 12px;border:1.5px solid var(--border2,#e2e8f0);
                 border-radius:8px;font-size:15px;letter-spacing:2px;text-align:center;
                 font-weight:600;outline:none;box-sizing:border-box" />
        <div style="font-size:11px;color:var(--ink5);margin-top:6px">
          Leave blank for open access — students won't need a code.
        </div>
      </div>

      <div style="margin-bottom:20px">
        <label style="display:block;font-size:12px;font-weight:600;color:var(--ink4);margin-bottom:6px">
          Session Duration
        </label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="subjectSessionDuration" type="number" min="0" value="5"
            style="width:80px;padding:10px 12px;border:1.5px solid var(--border2,#e2e8f0);
                   border-radius:8px;font-size:14px;outline:none;text-align:center;
                   background:white;color:var(--ink2);box-sizing:border-box" />
          <span style="font-size:13px;color:var(--ink4);font-weight:600">Min</span>
          <input id="subjectSessionSeconds" type="number" min="0" max="59" value="0"
            style="width:80px;padding:10px 12px;border:1.5px solid var(--border2,#e2e8f0);
                   border-radius:8px;font-size:14px;outline:none;text-align:center;
                   background:white;color:var(--ink2);box-sizing:border-box" />
          <span style="font-size:13px;color:var(--ink4);font-weight:600">Sec</span>
        </div>
        <div style="font-size:11px;color:var(--ink5);margin-top:6px">Set to 0 for "Until Manually Stopped".</div>
      </div>

      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('subjectSessionModal').remove()"
          style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #e2e8f0;
                 background:none;font-size:13px;font-weight:600;cursor:pointer;color:var(--ink4)">
          Cancel
        </button>
        <button id="startSubjectSessionBtn"
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#16a34a;color:#fff;font-size:13px;font-weight:600;cursor:pointer">
          ▶ Start Session
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.getElementById('subjectSessionPasscode').focus();

  document.getElementById('startSubjectSessionBtn').addEventListener('click', async () => {
    const passcode = document.getElementById('subjectSessionPasscode').value.trim();
    const minVal = parseFloat(document.getElementById('subjectSessionDuration').value) || 0;
    const secVal = parseFloat(document.getElementById('subjectSessionSeconds').value) || 0;
    const duration = Math.max(0, minVal + (secVal / 60));
    const btn      = document.getElementById('startSubjectSessionBtn');

    btn.disabled    = true;
    btn.textContent = 'Starting…';

    try {
      // Save passcode to class so students can use it
      await apiFetch(API.updatePasscode(classId), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ passcode: passcode || null, duration }),
      });

      // Record session in DB
      await apiFetch('/api/start-attendance-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          class_name:       className,
          class_id:         classId,
          subject_id:       subjectId,
          session_password: passcode || null,
        }),
      });

      modal.remove();
      showToast(`Session started for "${subjectName}"!`, 'success');
      loadSessions();

      // Open the class subjects wrapper so timer is visible
      const wrapper = document.querySelector(`.class-subjects-wrapper[data-class-id="${classId}"]`);
      const chevron = document.querySelector(`.class-toggle-btn[data-class-id="${classId}"] .class-chevron`);
      if (wrapper) wrapper.style.display = 'block';
      if (chevron) chevron.style.transform = 'rotate(180deg)';

      // Start countdown timer if duration > 0
      if (duration > 0) {
        const timerSection = document.getElementById(`timer-section-${classId}`);
        const timerDisplay = document.getElementById(`timer-display-${classId}`);

        if (timerSection && timerDisplay) {
          timerSection.style.display = 'flex';
          if (state.activeTimers[classId]) clearInterval(state.activeTimers[classId].intervalId);

          let remaining = duration * 60;
          const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
          timerDisplay.textContent = fmt(remaining);

          state.activeTimers[classId] = { isPaused: false };
          state.activeTimers[classId].intervalId = setInterval(async () => {
            if (state.activeTimers[classId]?.isPaused) return;
            remaining--;
            timerDisplay.textContent = fmt(remaining);
            if (remaining <= 0) {
              clearInterval(state.activeTimers[classId].intervalId);
              timerSection.style.display = 'none';
              delete state.activeTimers[classId];

              // Clear password in DB when timer expires
              await apiFetch(API.updatePasscode(classId), {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ passcode: null, duration: 0 }),
              }).catch(() => {});

              // Also mark the active session as inactive
              try {
                const sessions = await apiFetch('/api/attendance-sessions');
                const active = (sessions.sessions || []).find(
                  s => s.class_id == classId && s.is_active !== false
                );
                if (active) {
                  await apiFetch(`/api/attendance-sessions/${active.id}/stop`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                  });
                }
              } catch {}

              showToast('Session expired — passcode cleared.', 'info');
              loadSessions();
            }
          }, 1000);
        }
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      btn.disabled    = false;
      btn.textContent = '▶ Start Session';
    }
  });

  document.getElementById('subjectSessionPasscode')
    .addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('startSubjectSessionBtn').click();
    });
}
// ===========================
// TEACHER SCHEDULE VIEW
// ===========================

/**
 * Flatten all subjects across all classes into the shape
 * renderScheduleGrid() expects, then render the grid + table.
 */
function buildTeacherSubjects() {
  const COLORS = [
    '#4361EE','#10B981','#F59E0B','#EF4444','#8B5CF6',
    '#EC4899','#06B6D4','#F97316','#14B8A6','#6366F1',
  ];
  let colorIdx = 0;
  const subjects = [];

  (state.classesData || []).forEach(cls => {
    (cls.subjects || []).forEach(sub => {
      // Normalise days: "Mon, Wed" → ["Mon","Wed"]
      const days = Array.isArray(sub.days)
        ? sub.days
        : (sub.days || '').split(',').map(d => d.trim()).filter(Boolean);

      // Build time string from 24-h fields: "08:00"→"08:00–09:30"
      let time = '';
      if (sub.start_time && sub.end_time) {
        time = sub.start_time.substring(0, 5) + '–' + sub.end_time.substring(0, 5);
      } else if (sub.time) {
        time = sub.time;
      }

      if (!time || days.length === 0) return; // skip subjects without time/days

      subjects.push({
        id:        sub.id,
        name:      sub.subject,
        days,
        time,
        room:      sub.room || 'TBA',
        teacher:   '', // teacher sees their own schedule; leave blank or use class name
        className: cls.class_name,
        color:     COLORS[colorIdx % COLORS.length],
        start_time: sub.start_time || '',
        end_time:   sub.end_time   || '',
      });
      colorIdx++;
    });
  });

  return subjects;
}

function getTeacherSubjectTimeRange(subj) {
  if (!subj.time) return { startMin: 0, endMin: 0 };
  const raw   = subj.time.replace(/\s*[-–—]\s*/g, '–');
  const parts = raw.split('–');
  if (parts.length < 2) return { startMin: 0, endMin: 0 };

  const startStr = parts[0].trim();
  const endStr   = parts[1].replace(/\s*(AM|PM)/i, '').trim();
  const isRaw24h = !/AM|PM/i.test(raw);
  const isPM     = /PM/i.test(parts[1]);

  function toMin(s, forcePM, is24) {
    const a = s.split(':');
    let h = parseInt(a[0], 10), m = parseInt(a[1], 10) || 0;
    if (isNaN(h)) return 0;
    if (is24)             return h * 60 + m;
    if (forcePM && h !== 12) h += 12;
    if (!forcePM && h === 12)  h = 0;
    return h * 60 + m;
  }

  let startMin = toMin(startStr, false, isRaw24h);
  let endMin   = toMin(endStr,   isPM,  isRaw24h);
  if (!isRaw24h && endMin   <= startMin) endMin   += 12 * 60;
  if (!isRaw24h && startMin <  7  * 60) startMin += 12 * 60;
  return { startMin, endMin };
}

function renderTeacherScheduleGrid() {
  const subjects = buildTeacherSubjects();
  const GS = 7 * 60, SM = 30, TS = 25;
  const DAYS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const DAYF  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const WE    = { Sat: true, Sun: true };

  function minToSlot(min) { return Math.round((min - GS) / SM); }
  function slotLabel(i) {
    const t = GS + i * SM, h = Math.floor(t / 60), m = t % 60;
    const hh = h % 12 || 12;
    return hh + ':' + String(m).padStart(2, '0');
  }

  let html = '<div class="sched-outer"><div class="sched-grid">'
    + '<div class="sg-corner"></div>';

  DAYS.forEach((d, i) => {
    html += `<div class="sg-day-head${WE[d] ? ' is-weekend' : ''}" style="grid-column:${i+2};grid-row:1"><span>${DAYF[i]}</span></div>`;
  });

  for (let s = 0; s < TS; s++) {
    const row = s + 2, tc = s % 2 === 0 ? 'hour' : 'half';
    html += `<div class="sg-time ${tc}" style="grid-column:1;grid-row:${row}"><span>${slotLabel(s)}</span></div>`;
    DAYS.forEach((d, i) => {
      html += `<div class="sg-cell ${tc}${WE[d] ? ' is-weekend' : ''}" style="grid-column:${i+2};grid-row:${row}"></div>`;
    });
  }

  subjects.forEach(subj => {
    const r  = getTeacherSubjectTimeRange(subj);
    const ss = minToSlot(r.startMin), es = minToSlot(r.endMin);
    const span = Math.max(1, es - ss), rs = ss + 2, re = rs + span;
    const t1 = slotLabel(ss), t2 = slotLabel(es);

    subj.days.forEach(dow => {
      const ci = DAYS.indexOf(dow);
      if (ci === -1) return;
      html += `<div class="sg-event" style="grid-column:${ci+2};grid-row:${rs}/${re};border-left:3px solid ${subj.color};background:${subj.color}1c;">
        <div class="sg-event-name" style="color:${subj.color}">${escapeHTML(subj.name)}</div>
        <div class="sg-event-row">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${subj.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg>
          ${t1} – ${t2}
        </div>
        <div class="sg-event-row">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${escapeHTML(subj.room)}
        </div>
        <div class="sg-event-row" style="opacity:.65;font-size:9px">${escapeHTML(subj.className)}</div>
      </div>`;
    });
  });

  html += '</div></div>';

  const gridEl = document.getElementById('teacherSchedGrid');
  if (gridEl) gridEl.innerHTML = html;

  const tbody = document.getElementById('teacherSchedSubjectBody');
  if (tbody) {
    tbody.innerHTML = subjects.map(s => `
      <tr>
        <td style="color:var(--ink4)">${escapeHTML(s.className)}</td>
        <td><div class="subject-cell">
          <div class="subject-dot" style="background:${s.color}"></div>
          ${escapeHTML(s.name)}
        </div></td>
        <td>${s.days.join(', ')}</td>
        <td><span class="mono">${s.time}</span></td>
        <td><span class="mono">${s.room}</span></td>
      </tr>`).join('');
  }
}

function showScheduleView() {
  // Hide main dash grid, show schedule panel
  document.querySelector('.dash-grid')?.style.setProperty('display', 'none');
  const pSched = document.getElementById('teacherSchedulePanel');
  if (pSched) pSched.style.display = 'block';
  const pSet = document.getElementById('teacherSettingsPanel');
  if (pSet) pSet.style.display = 'none';
  const pAtt = document.getElementById('attendancePanel');
  if (pAtt) pAtt.style.display = 'none';

  // Update header
  const pt = document.getElementById('pageTitle');
  const ps = document.getElementById('pageSub');
  if (pt) pt.textContent = 'Schedule';
  if (ps) ps.textContent = 'Your weekly timetable';

  // Sync nav active state
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('scheduleNavBtn')?.classList.add('active');
  document.querySelector('.nav-item[href="#schedule"]')?.classList.add('active');

  // Classes must be loaded first; loadClasses() already runs on DOMContentLoaded
  renderTeacherScheduleGrid();
}

function showSettingsView() {
  document.querySelector('.dash-grid')?.style.setProperty('display', 'none');
  const pSched = document.getElementById('teacherSchedulePanel');
  if (pSched) pSched.style.display = 'none';
  const pSet = document.getElementById('teacherSettingsPanel');
  if (pSet) pSet.style.display = 'block';
  const pAtt = document.getElementById('attendancePanel');
  if (pAtt) pAtt.style.display = 'none';

  const pt = document.getElementById('pageTitle');
  const ps = document.getElementById('pageSub');
  if (pt) pt.textContent = 'Settings';
  if (ps) ps.textContent = 'Profile & Preferences';

  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('settingsNavBtn')?.classList.add('active');
  document.querySelector('.nav-item[href="#settings"]')?.classList.add('active');
}

function showDashboardView() {
  document.querySelector('.dash-grid')?.style.setProperty('display', '');
  const pSched = document.getElementById('teacherSchedulePanel');
  if (pSched) pSched.style.display = 'none';
  const pSet = document.getElementById('teacherSettingsPanel');
  if (pSet) pSet.style.display = 'none';
  const pAtt = document.getElementById('attendancePanel');
  if (pAtt) pAtt.style.display = 'none';

  const pt = document.getElementById('pageTitle');
  const ps = document.getElementById('pageSub');
  if (pt) pt.textContent = 'Dashboard';
  if (ps) ps.textContent = 'Welcome back';

  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.querySelector('.nav-item[href="#dashboard"]')?.classList.add('active');

  const teacherName = document.querySelector('.student-name')?.textContent?.trim() || '';
  updateGreeting(teacherName);
  const dashBtn = document.getElementById('dashboardNavBtn') || document.querySelector('.nav-item[href="#dashboard"]');
  if (dashBtn) dashBtn.classList.add('active');
}

window.startSubjectSession = startSubjectSession;
window.openAttendanceView  = openAttendanceView;
window.openPasscodeModal   = openPasscodeModal;
window.deleteClass         = deleteClass;
window.deleteSubject       = deleteSubject;
window.toggleTimerPause    = toggleTimerPause;
window.stopTimer           = stopTimer;
window.openSubjectModal    = openSubjectModal;
window.openClassModal      = openClassModal;
window.endSession = endSession;
window.showScheduleView    = showScheduleView;
window.showDashboardView   = showDashboardView;

let previousPendingCount = -1;

async function updateTeacherNotifications() {
  try {
    const res = await apiFetch('/api/pending-enrollments');
    const reqs = res.requests || [];
    
    if (previousPendingCount !== -1 && reqs.length > previousPendingCount) {
      showToast(`You have ${reqs.length - previousPendingCount} new pending enrollment request(s)!`, 'info');
    }
    previousPendingCount = reqs.length;

    // ── Update notification dot ───────────────────────────────────
    const notifBtn = document.getElementById('notifBtn');
    let dot = notifBtn?.querySelector('.notif-dot');
    if (!dot && notifBtn) {
      dot = document.createElement('div');
      dot.className = 'notif-dot';
      dot.style.cssText = 'position:absolute;top:6px;right:8px;width:8px;height:8px;background:#ef4444;border-radius:50%;';
      notifBtn.appendChild(dot);
    }
    if (dot) dot.style.display = reqs.length > 0 ? 'block' : 'none';

    // ── Update notification dropdown ──────────────────────────────
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) {
      let container = dropdown.querySelector('.card-body');
      if (!container) {
        dropdown.innerHTML = '<div class="card-body" style="padding:0;max-height:300px;overflow-y:auto"></div>';
        container = dropdown.querySelector('.card-body');
      }

      if (reqs.length > 0) {
        container.innerHTML = reqs.map(r => `
          <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px;background:var(--surface,#fff)">
            <div style="font-size:13px;line-height:1.4">
              <strong style="color:var(--ink2)">${escapeHTML(r.student_name)}</strong> wants to join 
              <strong style="color:var(--ink2)">${escapeHTML(r.subject_name)}</strong><br>
              <span style="font-size:11px;color:var(--ink5)">${escapeHTML(r.class_name)}</span>
            </div>
            <div style="display:flex;gap:6px">
              <button onclick="handleEnrollmentRequest(${r.id}, 'approve')" style="flex:1;padding:6px;border:none;border-radius:6px;background:#10B981;color:white;cursor:pointer;font-size:11px;font-weight:600">Approve</button>
              <button onclick="handleEnrollmentRequest(${r.id}, 'reject')" style="flex:1;padding:6px;border:none;border-radius:6px;background:rgba(239,68,68,0.1);color:#ef4444;cursor:pointer;font-size:11px;font-weight:600">Reject</button>
            </div>
          </div>
        `).join('');
      } else {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink5);font-size:13px">No pending enrollment requests.</div>';
      }
    }

    // ── Only update the pending box if NOT in attendance view ─────
    // Updating the dash-grid DOM while attendance panel is open
    // would wipe wrap.dataset.records and lose the loaded records
    if (state.currentView !== 'attendance') {
      updatePendingEnrollmentsBox(reqs);
    }

  } catch (e) {
    console.error('Failed to load notifications:', e);
  }
}

function updatePendingEnrollmentsBox(reqs) {
  let box = document.getElementById('pendingEnrollmentsBox');

  // FIX 5: use a stable anchor element instead of traversing .closest('.card')
  // which breaks when the DOM structure changes.
  if (!box) {
    box = document.createElement('div');
    box.id = 'pendingEnrollmentsBox';
    box.className = 'card';
    box.style.cssText = 'margin-top: 20px; margin-bottom: 24px; overflow: hidden;';

    // Prefer an explicit anchor div; fall back to appending inside dash-grid
    const anchor = document.getElementById('pendingEnrollmentsAnchor')
      || document.querySelector('.dash-grid');

    if (anchor) {
      // insertBefore the anchor placeholder if it exists, otherwise just append
      const placeholder = document.getElementById('pendingEnrollmentsAnchor');
      if (placeholder) {
        placeholder.parentNode.insertBefore(box, placeholder);
      } else {
        anchor.appendChild(box);
      }
    }
  }

  if (box) {
    box.style.display = 'block';
    box.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid var(--border, #e2e8f0);display:flex;align-items:center;justify-content:space-between;background:var(--surface, #fff)">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:#fffbeb;color:#f59e0b;display:grid;place-items:center;flex-shrink:0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <h3 style="margin:0;font-size:15px;font-weight:700;color:var(--ink2, #1e293b)">Pending Requests</h3>
        </div>
        <span style="background:#f59e0b;color:white;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${reqs.length}</span>
      </div>
      <div style="padding:0; max-height: 280px; overflow-y: auto;">
        ${reqs.length === 0 ? `
          <div style="padding: 24px; text-align: center; color: var(--ink5, #64748b); font-size: 13px;">
            No pending requests at the moment.
          </div>
        ` : reqs.map(r => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border, #e2e8f0);background:var(--surface, #fff);transition:background 0.2s" onmouseover="this.style.background='var(--surface2, #f8fafc)'" onmouseout="this.style.background='var(--surface, #fff)'">
            <div style="min-width:0; padding-right:12px;">
              <div style="font-weight:600;font-size:14px;color:var(--ink2, #1e293b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(r.student_name)}</div>
              <div style="font-size:12px;color:var(--ink5, #64748b);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                Wants to join: <strong style="color:var(--accent, #1E40AF)">${escapeHTML(r.subject_name)}</strong> · ${escapeHTML(r.class_name)}
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
              <button onclick="handleEnrollmentRequest(${r.id}, 'approve')" title="Accept" style="width:36px;height:36px;border-radius:8px;border:1px solid #16a34a;background:#dcfce7;color:#16a34a;cursor:pointer;display:grid;place-items:center;transition:all 0.2s" onmouseover="this.style.background='#16a34a'; this.style.color='#fff'" onmouseout="this.style.background='#dcfce7'; this.style.color='#16a34a'">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <button onclick="handleEnrollmentRequest(${r.id}, 'reject')" title="Reject" style="width:36px;height:36px;border-radius:8px;border:1px solid #dc2626;background:#fee2e2;color:#dc2626;cursor:pointer;display:grid;place-items:center;transition:all 0.2s" onmouseover="this.style.background='#dc2626'; this.style.color='#fff'" onmouseout="this.style.background='#fee2e2'; this.style.color='#dc2626'">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

window.handleEnrollmentRequest = async function(id, action) {
  try {
    const res = await apiFetch('/api/handle-enrollment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: id, action })
    });
    if (res.success) {
      showToast(action === 'approve' ? 'Student approved!' : 'Request rejected.', 'success');

      // Always refresh notifications (safe — now guarded against DOM wipe)
      updateTeacherNotifications();

      if (state.currentView === 'attendance') {
        // Refresh enrolled students list so the new student appears
        // in the import match dropdown — but DO NOT reload classes
        // or touch the attendance grid DOM
        if (excelState.classRef && excelState.subjectRef) {
          apiFetch(`/api/enrolled-students/${excelState.classRef.id}/${excelState.subjectRef.id}`)
            .then(data => { excelState.enrolledStudents = data.students || []; })
            .catch(() => {});
        }
      } else {
        // Safe to do a full reload when not in attendance view
        if (window.loadClasses) loadClasses();
      }
    }
  } catch (e) {
    showToast('Error handling request: ' + e.message, 'error');
  }
};

// ===========================
// TEACHER PROFILE & SETTINGS
// ===========================
let currentTeacherAvatar = null;

window.loadTeacherProfile = async function() {
  try {
    const profile = await apiFetch('/api/user-profile');
    
    // Update header avatar
    const initials = (profile.name || 'T').charAt(0).toUpperCase();
    const headerAvatar = document.querySelector('#profileBtn');
    if (headerAvatar) {
      if (profile.avatar) {
        headerAvatar.innerHTML = `<img src="${profile.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`;
      } else {
        headerAvatar.innerHTML = `<div style="width:32px;height:32px;border-radius:50%;background:var(--accent,#1E40AF);color:white;display:grid;place-items:center;font-weight:bold">${initials}</div>`;
      }
    }
    
    // Update Settings Form fields
    const nameInput = document.getElementById('settingsName');
    const deptInput = document.getElementById('settingsDept');
    const emailInput = document.getElementById('settingsEmail');
    const settingsAvatar = document.getElementById('teacherAvatarImg');
    const initialsAvatar = document.getElementById('teacherAvatarInitials');
    
    if (nameInput) nameInput.value = profile.name || '';
    if (deptInput) deptInput.value = profile.department || '';
    if (emailInput) emailInput.value = profile.email || '';
    
    if (profile.name) updateGreeting(profile.name);
    
    if (profile.avatar) {
      currentTeacherAvatar = profile.avatar;
      if (settingsAvatar) { settingsAvatar.src = profile.avatar; settingsAvatar.style.display = 'block'; }
      if (initialsAvatar) initialsAvatar.style.display = 'none';
    } else {
      if (initialsAvatar) { initialsAvatar.textContent = initials; initialsAvatar.style.display = 'grid'; }
      if (settingsAvatar) settingsAvatar.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load teacher profile:', err);
  }
}

window.handleAvatarUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('File is too large (Max 2MB).', 'error'); return; }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    currentTeacherAvatar = e.target.result;
    const img = document.getElementById('teacherAvatarImg');
    const init = document.getElementById('teacherAvatarInitials');
    if (img) { img.src = currentTeacherAvatar; img.style.display = 'block'; }
    if (init) init.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

let isEditingTeacherProfile = false;
window.toggleTeacherProfileEdit = function() {
  isEditingTeacherProfile = !isEditingTeacherProfile;
  const nameInput = document.getElementById('settingsName');
  const deptInput = document.getElementById('settingsDept');
  const saveBtn = document.getElementById('saveProfileBtn');
  const editBtn = document.getElementById('editTeacherProfileBtn');
  const avatarBtn = document.getElementById('avatarUploadBtnWrapper');

  if (isEditingTeacherProfile) {
    if (nameInput) { nameInput.removeAttribute('readonly'); nameInput.style.background = 'var(--surface, #fff)'; nameInput.style.cursor = 'text'; }
    if (deptInput) { deptInput.removeAttribute('readonly'); deptInput.style.background = 'var(--surface, #fff)'; deptInput.style.cursor = 'text'; }
    if (saveBtn) saveBtn.style.display = 'block';
    if (avatarBtn) avatarBtn.style.display = 'block';
    if (editBtn) {
      editBtn.innerHTML = 'Cancel';
      editBtn.style.color = '#ef4444';
      editBtn.style.borderColor = 'rgba(239,68,68,0.3)';
    }
  } else {
    if (nameInput) { nameInput.setAttribute('readonly', 'true'); nameInput.style.background = 'var(--surface2, #f8fafc)'; nameInput.style.cursor = 'not-allowed'; }
    if (deptInput) { deptInput.setAttribute('readonly', 'true'); deptInput.style.background = 'var(--surface2, #f8fafc)'; deptInput.style.cursor = 'not-allowed'; }
    if (saveBtn) saveBtn.style.display = 'none';
    if (avatarBtn) avatarBtn.style.display = 'none';
    if (editBtn) {
      editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit Profile`;
      editBtn.style.color = '';
      editBtn.style.borderColor = '';
    }
    loadTeacherProfile(); // Revert any unsaved changes
  }
};

window.saveTeacherProfile = async function() {
  const name = document.getElementById('settingsName')?.value.trim();
  const dept = document.getElementById('settingsDept')?.value.trim();
  const btn = document.getElementById('saveProfileBtn');
  if (!name) { showToast('Name cannot be empty', 'error'); return; }
  
  await withLoading(btn, 'Saving...', async () => {
    try {
      const res = await apiFetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, department: dept, section: null, avatar: currentTeacherAvatar })
      });
      if (res.success) {
        showToast('Profile updated successfully!', 'success');
        if (isEditingTeacherProfile) toggleTeacherProfileEdit(); // Turn off edit mode
        loadTeacherProfile(); // Refresh avatars globally
      }
    } catch (err) {
      showToast('Failed to save profile: ' + err.message, 'error');
    }
  });
}
function getTodayInputDate() {
  const d = new Date();
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

function toInputDate(dateStr) {
  if (!dateStr) return getTodayInputDate();
  const d = new Date(dateStr);
  if (isNaN(d)) return getTodayInputDate();
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}
// =====================================================================
// ATTENDANCE IMPORT — Excel/CSV upload with preview & student matching
// =====================================================================

function openImportModal(cls, subject) {
  const existing = document.getElementById('attImportModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'attImportModal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(11,18,32,.85);backdrop-filter:blur(6px);
    z-index:1400;display:flex;align-items:center;justify-content:center;padding:20px`;

  modal.innerHTML = `
    <style>
      #attImportModal * { box-sizing:border-box; }
      .imp-panel {
        background:var(--dark-800,#111d30);
        border:1px solid rgba(79,172,254,.2);
        border-radius:16px;
        width:100%;max-width:900px;
        max-height:90vh;
        display:flex;flex-direction:column;
        box-shadow:0 24px 64px rgba(11,18,32,.6);
        overflow:hidden;
      }
      .imp-header {
        padding:20px 24px;
        border-bottom:1px solid rgba(79,172,254,.15);
        display:flex;align-items:center;justify-content:space-between;
        background:rgba(79,172,254,.04);
        flex-shrink:0;
      }
      .imp-body { flex:1;overflow-y:auto;padding:24px; }
      .imp-footer {
        padding:16px 24px;
        border-top:1px solid rgba(79,172,254,.15);
        display:flex;gap:10px;justify-content:flex-end;
        flex-shrink:0;
        background:rgba(79,172,254,.04);
      }
      .imp-drop-zone {
        border:2px dashed rgba(79,172,254,.3);
        border-radius:12px;
        padding:48px 24px;
        text-align:center;
        cursor:pointer;
        transition:all .2s;
        background:rgba(79,172,254,.03);
      }
      .imp-drop-zone:hover, .imp-drop-zone.drag-over {
        border-color:rgba(79,172,254,.7);
        background:rgba(79,172,254,.08);
      }
      .imp-drop-icon {
        width:56px;height:56px;border-radius:14px;
        background:rgba(79,172,254,.12);
        display:grid;place-items:center;
        margin:0 auto 16px;
      }
      .imp-table-wrap {
        overflow:auto;
        border:1px solid rgba(79,172,254,.15);
        border-radius:10px;
        max-height:400px;
      }
      .imp-table {
        width:max-content;min-width:100%;
        border-collapse:collapse;
        font-size:12.5px;
      }
      .imp-table th {
        background:rgba(79,172,254,.08);
        padding:10px 14px;
        text-align:left;
        font-size:10px;font-weight:800;
        color:rgba(79,172,254,.8);
        text-transform:uppercase;letter-spacing:.07em;
        border-bottom:1px solid rgba(79,172,254,.15);
        white-space:nowrap;
        position:sticky;top:0;z-index:2;
      }
      .imp-table td {
        padding:9px 14px;
        border-bottom:1px solid rgba(79,172,254,.08);
        color:#e8f2ff;
        vertical-align:middle;
      }
      .imp-table tbody tr:hover td { background:rgba(79,172,254,.06); }
      .imp-table tbody tr:last-child td { border-bottom:none; }
      .imp-status-badge {
        display:inline-flex;align-items:center;gap:4px;
        padding:3px 9px;border-radius:999px;
        font-size:11px;font-weight:700;
      }
      .imp-badge-present { background:rgba(34,197,94,.15);color:#22c55e; }
      .imp-badge-absent  { background:rgba(239,68,68,.15);color:#ef4444; }
      .imp-badge-late    { background:rgba(245,158,11,.15);color:#f59e0b; }
      .imp-badge-unknown { background:rgba(79,172,254,.12);color:rgba(79,172,254,.7); }
      .imp-match-select {
        padding:5px 8px;
        border:1px solid rgba(79,172,254,.2);
        border-radius:6px;
        background:var(--dark-700,#1a2d47);
        color:#e8f2ff;
        font-size:12px;
        outline:none;
        max-width:180px;
      }
      .imp-match-select:focus { border-color:rgba(79,172,254,.5); }
      .imp-cell-edit {
        padding:5px 8px;
        border:1px solid rgba(79,172,254,.2);
        border-radius:6px;
        background:var(--dark-700,#1a2d47);
        color:#e8f2ff;
        font-size:12px;
        outline:none;
        width:100px;
      }
      .imp-cell-edit:focus { border-color:rgba(79,172,254,.5); }
      .imp-btn {
        display:inline-flex;align-items:center;gap:6px;
        padding:9px 18px;border-radius:8px;
        font-size:13px;font-weight:700;cursor:pointer;
        transition:all .15s;border:none;
      }
      .imp-btn-primary {
        background:linear-gradient(135deg,#4facfe 0%,#0a6dd9 100%);
        color:#fff;
        box-shadow:0 4px 14px rgba(79,172,254,.35);
      }
      .imp-btn-primary:hover { background:linear-gradient(135deg,#6fbeff 0%,#1a80e8 100%); }
      .imp-btn-primary:disabled { opacity:.5;cursor:not-allowed; }
      .imp-btn-ghost {
        background:rgba(79,172,254,.08);
        color:rgba(79,172,254,.8);
        border:1px solid rgba(79,172,254,.2);
      }
      .imp-btn-ghost:hover { background:rgba(79,172,254,.15);color:#e8f2ff; }
      .imp-step-indicator {
        display:flex;align-items:center;gap:8px;
        margin-bottom:20px;
      }
      .imp-step {
        display:flex;align-items:center;gap:6px;
        font-size:12px;font-weight:600;
        color:rgba(79,172,254,.4);
      }
      .imp-step.active { color:rgba(79,172,254,.9); }
      .imp-step.done   { color:#22c55e; }
      .imp-step-num {
        width:22px;height:22px;border-radius:50%;
        border:1.5px solid currentColor;
        display:grid;place-items:center;
        font-size:10px;font-weight:800;
        flex-shrink:0;
      }
      .imp-step-sep { flex:1;height:1px;background:rgba(79,172,254,.15);max-width:40px; }
      .imp-summary-box {
        background:rgba(34,197,94,.08);
        border:1px solid rgba(34,197,94,.25);
        border-radius:10px;
        padding:16px 20px;
        margin-bottom:20px;
      }
    </style>

    <div class="imp-panel">
      <div class="imp-header">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:38px;height:38px;border-radius:10px;background:rgba(79,172,254,.12);
                      display:grid;place-items:center;flex-shrink:0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(79,172,254,.9)"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 5 17 10"/>
              <line x1="12" y1="5" x2="12" y2="17"/>
            </svg>
          </div>
          <div>
            <div style="font-size:15px;font-weight:800;color:#e8f2ff">Import Attendance</div>
            <div style="font-size:11px;color:rgba(79,172,254,.6);margin-top:1px">
              ${escapeHTML(subject.subject)} · ${escapeHTML(cls.class_name)}
            </div>
          </div>
        </div>
        <button onclick="document.getElementById('attImportModal').remove()"
          style="border:none;background:none;font-size:22px;color:rgba(79,172,254,.5);cursor:pointer;
                 padding:4px;border-radius:6px;transition:color .15s"
          onmouseover="this.style.color='#e8f2ff'" onmouseout="this.style.color='rgba(79,172,254,.5)'">×</button>
      </div>

      <div class="imp-body">
        <!-- Step indicators -->
        <div class="imp-step-indicator">
          <div class="imp-step active" id="impStep1Indicator">
            <div class="imp-step-num">1</div><span>Upload File</span>
          </div>
          <div class="imp-step-sep"></div>
          <div class="imp-step" id="impStep2Indicator">
            <div class="imp-step-num">2</div><span>Review & Match</span>
          </div>
          <div class="imp-step-sep"></div>
          <div class="imp-step" id="impStep3Indicator">
            <div class="imp-step-num">3</div><span>Confirm Import</span>
          </div>
        </div>

        <!-- Step 1: Upload -->
        <div id="impStep1">
          <div class="imp-drop-zone" id="impDropZone" onclick="document.getElementById('impFileInput').click()">
            <div class="imp-drop-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(79,172,254,.8)"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <div style="font-size:15px;font-weight:700;color:#e8f2ff;margin-bottom:6px">
              Drop your file here or click to browse
            </div>
            <div style="font-size:12px;color:rgba(79,172,254,.5)">
              Supports .CSV and .XLSX files
            </div>
            <input type="file" id="impFileInput" accept=".csv,.xlsx,.xls"
                   style="display:none" onchange="handleImportFile(event)"/>
          </div>

          <div style="margin-top:20px;padding:16px;background:rgba(79,172,254,.05);
                      border:1px solid rgba(79,172,254,.12);border-radius:10px">
            <div style="font-size:12px;font-weight:700;color:rgba(79,172,254,.8);margin-bottom:10px">
              📋 Expected Format
            </div>
            <div style="font-size:11.5px;color:rgba(79,172,254,.55);line-height:1.8">
              Your file should have these columns (in any order):<br>
              <span style="font-family:monospace;color:rgba(79,172,254,.75)">
                Student Name</span> · 
              <span style="font-family:monospace;color:rgba(79,172,254,.75)">Date</span> · 
              <span style="font-family:monospace;color:rgba(79,172,254,.75)">Status</span>
              (Present / Absent / Late)<br>
              <span style="color:rgba(79,172,254,.4);font-size:11px">
                Date can be any format: May 5, 2025 · 2025-05-05 · 05/05/2025
              </span>
            </div>
          </div>
        </div>

        <!-- Step 2: Review & Match -->
        <div id="impStep2" style="display:none">
          <div id="impPreviewContent"></div>
        </div>

        <!-- Step 3: Confirm -->
        <div id="impStep3" style="display:none">
          <div id="impConfirmContent"></div>
        </div>
      </div>

      <div class="imp-footer">
        <button class="imp-btn imp-btn-ghost" id="impBackBtn"
                style="display:none" onclick="importGoBack()">← Back</button>
        <button class="imp-btn imp-btn-ghost"
                onclick="document.getElementById('attImportModal').remove()">Cancel</button>
        <button class="imp-btn imp-btn-primary" id="impNextBtn"
                style="display:none" onclick="importGoNext()">Review →</button>
        <button class="imp-btn imp-btn-primary" id="impSaveBtn"
                style="display:none" onclick="confirmImport()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Save to Attendance
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Drag and drop
  const dropZone = document.getElementById('impDropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processImportFile(file, cls, subject);
  });

  // Store refs
  modal._cls = cls;
  modal._subject = subject;
}

// ── Parse uploaded file ──────────────────────────────────────────────
window._importData = { rows: [], cls: null, subject: null };

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const modal = document.getElementById('attImportModal');
  processImportFile(file, modal._cls, modal._subject);
}

function processImportFile(file, cls, subject) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => {
      const rows = parseCSV(e.target.result);
      showImportPreview(rows, cls, subject);
    };
    reader.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        // Use SheetJS if available
        if (typeof XLSX !== 'undefined') {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          showImportPreview(rows, cls, subject);
        } else {
          // Fallback: load SheetJS dynamically
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          script.onload = () => {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            showImportPreview(rows, cls, subject);
          };
          document.head.appendChild(script);
        }
      } catch (err) {
        showToast('Failed to read Excel file: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    showToast('Unsupported file type. Please use CSV or XLSX.', 'error');
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return toDisplayDate(d);
  }

  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    // Try MM/DD/YYYY then DD/MM/YYYY
    const guesses = [new Date(c, a - 1, b), new Date(c, b - 1, a)];
    for (const g of guesses) {
      if (!isNaN(g.getTime())) {
        return toDisplayDate(g);   // ← was broken before
      }
    }
  }

  return s;
}

function normalizeStatus(raw) {
  if (!raw) return 'present';  
  const s = String(raw).trim().toLowerCase();
  if (s === 'p' || s === 'present' || s === '1' || s === 'yes') return 'present';
  if (s === 'a' || s === 'absent'  || s === '0' || s === 'no')  return 'absent';
  if (s === 'l' || s === 'late')                                 return 'late';
  return 'present';  
}

// ── Show preview step ────────────────────────────────────────────────
function detectImportFormat(header) {
  // Returns 'long' (one row per record) or 'wide' (pivot: student | date1 | date2 ...)
  const nameCol   = header.findIndex(h => h.includes('name') || h.includes('student'));
  const dateCol   = header.findIndex(h => h.includes('date'));
  const statusCol = header.findIndex(h =>
    h.includes('status') || h.includes('attendance') || h.includes('present') || h.includes('absent'));

  // If there's a dedicated date column → long format
  if (nameCol !== -1 && dateCol !== -1) return { format: 'long', nameCol, dateCol, statusCol };

  // If multiple columns look like dates → wide/pivot format
  const dateCols = [];
  header.forEach((h, i) => {
    if (i === nameCol) return;
    const normalized = normalizeDate(h);
    if (normalized && normalized !== h) dateCols.push({ col: i, dateStr: normalized, raw: h });
    else {
      // Try if it parses as a date string like "May 1" or "2025-05-01"
      const d = new Date(h);
      if (!isNaN(d.getTime())) dateCols.push({ col: i, dateStr: toDisplayDate(d), raw: h });
    }
  });

  if (nameCol !== -1 && dateCols.length >= 2) return { format: 'wide', nameCol, dateCols };

  // Fallback to long with whatever we found
  return { format: 'long', nameCol, dateCol, statusCol };
}

function showImportPreview(rawRows, cls, subject) {
  if (!rawRows || rawRows.length < 2) {
    showToast('File appears empty or unreadable.', 'error'); return;
  }

  const header = rawRows[0].map(h => String(h).trim().toLowerCase());
  const headerRaw = rawRows[0].map(h => String(h).trim());
  const detected = detectImportFormat(header);

  if (detected.nameCol === -1) {
    showToast('Could not find "Student Name" column. Please check your file.', 'error'); return;
  }

  const parsed = [];

  if (detected.format === 'wide') {
    // ── WIDE/PIVOT FORMAT ──────────────────────────────────────────
    // Each row is a student, each date column is a separate record
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.every(c => !String(c).trim())) continue;
      const name = String(row[detected.nameCol] || '').trim();
      if (!name) continue;

      detected.dateCols.forEach(({ col, dateStr }) => {
        const rawStatus = String(row[col] || '').trim();
        if (!rawStatus) return; // skip empty cells
        parsed.push({
          name,
          date: dateStr,
          status: normalizeStatus(rawStatus),
          rawRow: row,
          idx: i,
        });
      });
    }
  } else {
    // ── LONG FORMAT (original) ─────────────────────────────────────
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.every(c => !String(c).trim())) continue;
      const name   = String(row[detected.nameCol] || '').trim();
      const date   = detected.dateCol >= 0 ? normalizeDate(row[detected.dateCol]) : null;
      const status = detected.statusCol >= 0 ? normalizeStatus(row[detected.statusCol]) : null;
      if (!name) continue;
      parsed.push({ name, date, status, rawRow: row, idx: i });
    }
  }

  if (parsed.length === 0) {
    showToast('No valid rows found in file.', 'error'); return;
  }

  // Get existing enrolled students for matching
  const enrolledStudents = excelState.enrolledStudents || [];

  // Store for later
  window._importData = { rows: parsed, cls, subject, detected };

  // Build preview table HTML
  const statusBadge = s => {
    if (!s) return '<span class="imp-status-badge imp-badge-unknown">—</span>';
    const cls2 = s === 'present' ? 'imp-badge-present' : s === 'absent' ? 'imp-badge-absent' : 'imp-badge-late';
    return `<span class="imp-status-badge ${cls2}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
  };


  const matchOptions = (rowName) => {
    if (enrolledStudents.length === 0) {
      return `<option value="">— No enrolled students —</option>`;
    }

    // Try to auto-match by comparing name similarity
    const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const rowNorm   = normalize(rowName);

    // Find best match — exact first, then partial
    let bestMatch = enrolledStudents.find(s =>
      normalize(s.name) === rowNorm
    );
    if (!bestMatch) {
      bestMatch = enrolledStudents.find(s =>
        normalize(s.name).includes(rowNorm) || rowNorm.includes(normalize(s.name))
      );
    }

    const opts = enrolledStudents.map(s =>
      `<option value="${escapeHTML(s.email)}"
        ${bestMatch && s.email === bestMatch.email ? 'selected' : ''}>
        ${escapeHTML(s.name)} (${escapeHTML(s.email)})
      </option>`
    ).join('');

    return `<option value="" ${!bestMatch ? 'selected' : ''}>— Select student —</option>${opts}`;
  };

  // Pre-select status option helper
  const statusOpts = (current) => ['present','absent','late'].map(s =>
    `<option value="${s}" ${current === s ? 'selected' : ''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
  ).join('');

  let previewHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:14px;font-weight:700;color:#e8f2ff">
          ${parsed.length} record${parsed.length !== 1 ? 's' : ''} found
          ${detected.format === 'wide' ? `<span style="margin-left:8px;padding:2px 8px;border-radius:99px;background:rgba(79,172,254,.15);color:rgba(79,172,254,.8);font-size:11px;font-weight:600">Wide/Pivot format</span>` : ''}
        </div>
        <div style="font-size:11.5px;color:rgba(79,172,254,.5);margin-top:2px">
          Review each row. Edit status or date if needed.
        </div>
      </div>
    </div>
    <div class="imp-table-wrap">
      <table class="imp-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name in File</th>
            <th>Match to Student</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="impPreviewTableBody">
          ${parsed.map((r, ri) => `
            <tr data-idx="${ri}" style="${ri % 2 === 0 ? '' : 'background:rgba(79,172,254,.04)'}">
              <td style="color:rgba(79,172,254,.4);font-family:monospace">${ri + 1}</td>
              <td style="font-weight:600;color:#e8f2ff">${escapeHTML(r.name)}</td>
              <td>
                <select class="imp-match-select" data-row="${ri}" id="impMatch_${ri}">
                  ${matchOptions(r.name)}
                </select>
              </td>
              <td>
                <input class="imp-cell-edit" type="date"
                  value="${r.date ? toInputDate(r.date) : getTodayInputDate()}"
                  data-row="${ri}" id="impDate_${ri}"
                  style="width:140px;padding:5px 8px;border:1px solid rgba(79,172,254,.2);
                        border-radius:6px;background:var(--dark-700,#1a2d47);color:#e8f2ff;
                        font-size:12px;outline:none;cursor:pointer"/>
              </td>
              <td>
                <select class="imp-match-select" data-row="${ri}" id="impStatus_${ri}"
                        style="width:110px">
                  <option value="">—</option>
                  ${statusOpts(r.status || 'present')}
                </select>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('impPreviewContent').innerHTML = previewHTML;

  // Switch to step 2
  document.getElementById('impStep1').style.display = 'none';
  document.getElementById('impStep2').style.display = 'block';
  document.getElementById('impStep1Indicator').className = 'imp-step done';
  document.getElementById('impStep2Indicator').className = 'imp-step active';
  document.getElementById('impNextBtn').style.display = 'flex';
  document.getElementById('impBackBtn').style.display = 'flex';
}

function importGoBack() {
  const step2 = document.getElementById('impStep2');
  const step3 = document.getElementById('impStep3');
  if (step3.style.display !== 'none') {
    // Go back to step 2
    step3.style.display = 'none';
    step2.style.display = 'block';
    document.getElementById('impStep2Indicator').className = 'imp-step active';
    document.getElementById('impStep3Indicator').className = 'imp-step';
    document.getElementById('impNextBtn').style.display = 'flex';
    document.getElementById('impSaveBtn').style.display = 'none';
  } else {
    // Go back to step 1
    step2.style.display = 'none';
    document.getElementById('impStep1').style.display = 'block';
    document.getElementById('impStep1Indicator').className = 'imp-step active';
    document.getElementById('impStep2Indicator').className = 'imp-step';
    document.getElementById('impNextBtn').style.display = 'none';
    document.getElementById('impBackBtn').style.display = 'none';
  }
}

function importGoNext() {
  // Collect all edited values from step 2
  const { rows, cls, subject } = window._importData;
  const finalRows = [];
  let warnings = 0;

  rows.forEach((r, ri) => {
    const matchedEmail = document.getElementById(`impMatch_${ri}`)?.value || '';
    const date         = document.getElementById(`impDate_${ri}`)?.value.trim() || '';
    const status       = document.getElementById(`impStatus_${ri}`)?.value || '';

    if (!status) { warnings++; }

    finalRows.push({
      ...r,
      matchedEmail,
      date: date || getTodayInputDate(),
      status: status || null,
    });
  });

  window._importData.finalRows = finalRows;

  // Build confirm summary
  const valid    = finalRows.filter(r => r.status && r.date);
  const noMatch  = finalRows.filter(r => !r.matchedEmail);
  const noStatus = finalRows.filter(r => !r.status);
  const noDate   = finalRows.filter(r => !r.date);

  // Count unique students (deduplicate by name, ignoring multiple dates)
  const uniqueStudents    = new Set(valid.map(r => r.name.toLowerCase().trim()));
  const uniqueNoMatch     = new Set(noMatch.filter(r => r.status && r.date).map(r => r.name.toLowerCase().trim()));
  const uniqueDates       = new Set(valid.map(r => r.date));

  // Count updates vs new inserts by checking against existing records
  const normalize = s => (s || '').toLowerCase().trim();
  let willUpdate = 0, willInsert = 0;
  valid.forEach(row => {
    const incomingDate = row.date
      ? toDisplayDate(new Date(row.date + 'T00:00:00Z'))
      : null;
    const exists = excelState.allRecords.find(r => {
      const ts = r.marked_at || r.created_at;
      if (!ts) return false;
      if (toDisplayDate(ts) !== incomingDate) return false;
      if (row.matchedEmail && isRealEmail(row.matchedEmail)) {
        return r.student_email === row.matchedEmail;
      }
      return normalize(r.student_name) === normalize(row.name);
    });
    if (exists) willUpdate++; else willInsert++;
  });

  const confirmHTML = `
    <div class="imp-summary-box">
      <div style="font-size:14px;font-weight:700;color:#22c55e;margin-bottom:10px">
        ✓ Ready to import ${valid.length} record${valid.length !== 1 ? 's' : ''}
        for ${uniqueStudents.size} student${uniqueStudents.size !== 1 ? 's' : ''}
        across ${uniqueDates.size} date${uniqueDates.size !== 1 ? 's' : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:800;color:#22c55e">${uniqueStudents.size}</div>
          <div style="font-size:11px;color:rgba(79,172,254,.5)">Unique students</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:800;color:#4facfe">${willInsert}</div>
          <div style="font-size:11px;color:rgba(79,172,254,.5)">New records</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:800;color:#f59e0b">${willUpdate}</div>
          <div style="font-size:11px;color:rgba(79,172,254,.5)">Will update<br><span style="font-size:9px;opacity:.7">(same date exists)</span></div>
        </div>
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:800;color:#ef4444">${finalRows.length - valid.length}</div>
          <div style="font-size:11px;color:rgba(79,172,254,.5)">Skipped<br><span style="font-size:9px;opacity:.7">(missing data)</span></div>
        </div>
      </div>
    </div>

    ${noMatch.length > 0 ? `
      <div style="margin-bottom:16px;padding:12px 16px;background:rgba(245,158,11,.08);
                  border:1px solid rgba(245,158,11,.2);border-radius:10px">
        <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:6px">
          ⚠ ${noMatch.length} row(s) without a student match — saved as unlinked, can be connected later
        </div>
        ${noMatch.filter(r => r.status && r.date).map(r => `
          <div style="font-size:11.5px;color:rgba(245,158,11,.7);padding:2px 0">
            • ${escapeHTML(r.name)} · ${escapeHTML(r.date || '—')}
          </div>`).join('')}
      </div>` : ''}

    <div style="font-size:13px;font-weight:600;color:#e8f2ff;margin-bottom:12px">
      Records to be saved:
    </div>
    <div class="imp-table-wrap" style="max-height:280px">
      <table class="imp-table">
        <thead>
          <tr>
            <th>Name in File</th>
            <th>Linked Student</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${valid.map(r => {
            const sc = r.status === 'present' ? 'imp-badge-present' :
                       r.status === 'absent'  ? 'imp-badge-absent'  : 'imp-badge-late';
            return `<tr>
              <td style="font-weight:600;color:#e8f2ff">${escapeHTML(r.name)}</td>
              <td style="font-size:11px;color:${r.matchedEmail ? '#22c55e' : 'rgba(245,158,11,.7)'}">
                ${r.matchedEmail ? escapeHTML(r.matchedEmail) : '⚠ Unlinked'}
              </td>
              <td style="font-family:monospace;font-size:11.5px;color:rgba(79,172,254,.6)">
                ${escapeHTML(r.date)}
              </td>
              <td>
                <span class="imp-status-badge ${sc}">
                  ${r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('impConfirmContent').innerHTML = confirmHTML;

  // Switch to step 3
  document.getElementById('impStep2').style.display = 'none';
  document.getElementById('impStep3').style.display = 'block';
  document.getElementById('impStep2Indicator').className = 'imp-step done';
  document.getElementById('impStep3Indicator').className = 'imp-step active';
  document.getElementById('impNextBtn').style.display = 'none';
  document.getElementById('impSaveBtn').style.display = 'flex';
}

async function confirmImport() {
  const { finalRows, cls, subject } = window._importData;
  const saveBtn = document.getElementById('impSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const subjectIdInt = Math.trunc(Number(subject.id));

  // Use today's date formatted the same way the grid uses
  const today = new Date();
  const fallbackDate = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Include ALL rows that have a status — date is optional now
  const valid = finalRows.filter(r => r.status);

  let saved = 0, failed = 0;

  for (const row of valid) {
    try {
      const dateToUse = row.date || fallbackDate;

      // Normalize the incoming date to the same display format toDisplayDate uses
      // so comparison against existing records is consistent
      const incomingDateDisplay = toDisplayDate(
        // row.date is already "YYYY-MM-DD" from the date input
        // parse it as UTC to avoid timezone day-shift
        row.date
          ? new Date(row.date + 'T00:00:00Z')
          : new Date()
      );

      // ── Find existing record by name (and optionally email) + date ──
      const existing = excelState.allRecords.find(r => {
        const ts = r.marked_at || r.created_at;
        if (!ts) return false;
        const recDateDisplay = toDisplayDate(ts);

        // Date must match
        if (recDateDisplay !== incomingDateDisplay) return false;

        // Match by email first (more reliable)
        if (row.matchedEmail && isRealEmail(row.matchedEmail)) {
          return r.student_email === row.matchedEmail;
        }

        // Fallback: match by name (case-insensitive)
        return (r.student_name || '').toLowerCase().trim() ===
               (row.name || '').toLowerCase().trim();
      });

      if (existing) {
        // ── UPDATE existing record ──────────────────────────────────
        if (existing.status !== row.status) {
          await apiFetch(`/api/attendance/${existing.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ status: row.status }),
          });
          existing.status = row.status;

          // Also update email if we now have a match and it was unlinked before
          if (row.matchedEmail && isRealEmail(row.matchedEmail) &&
              !isRealEmail(existing.student_email)) {
            await apiFetch('/api/attendance/update-student', {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                origEmail:  existing.student_email || '',
                newName:    row.name,
                newEmail:   row.matchedEmail,
                recordIds:  [existing.id],
              }),
            });
            existing.student_email = row.matchedEmail;
          }
        }
        saved++;
      } else {
        // ── INSERT new record ───────────────────────────────────────
        const newRecord = await apiFetch('/api/attendance/import', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            classId:      cls.id,
            subjectId:    subjectIdInt,
            studentName:  row.name,
            studentEmail: row.matchedEmail || null,
            date:         dateToUse,
            status:       row.status,
            room:         subject.room || '',
            startTime:    subject.start_time || '',
            endTime:      subject.end_time || '',
          }),
        });
        if (newRecord && newRecord.record) {
          excelState.allRecords.push(newRecord.record);
        }
        saved++;
      }
    } catch (err) {
      console.warn('Import row failed:', row, err.message);
      failed++;
    }
  }
  // Refresh the grid
  const wrap = document.getElementById('attendanceTableWrap');
  if (wrap) wrap.dataset.records = JSON.stringify(excelState.allRecords);
  rerenderGrid();

  document.getElementById('attImportModal').remove();

  const skipped = finalRows.length - valid.length;
  if (failed === 0) {
    showToast(`Import done! ${saved} record(s) saved.${skipped ? ` ${skipped} row(s) skipped (missing status).` : ''}`, 'success');
  } else {
    showToast(`${saved} saved, ${failed} failed.`, 'info');
  }
}