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
// ATTENDANCE VIEW
// ===========================

function openAttendanceView(cls, subject) {
  state.currentView = 'attendance';
  state.selectedClassId  = cls.id;
  state.selectedSubjectId = subject.id;

  // Build / show the attendance overlay panel
  let panel = document.getElementById('attendancePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'attendancePanel';
    panel.style.cssText = `
      position:absolute;inset:0;z-index:1100;background:var(--bg,#f0f4fa);
      display:flex;flex-direction:column;overflow:hidden;`;
    document.querySelector('.main').appendChild(panel);
  }

  panel.innerHTML = `
    <div style="background:var(--surface,#fff);border-bottom:1px solid var(--border,rgba(15,23,42,.08));
                padding:0 28px;height:60px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:12px">
        <button id="attendanceBackBtn"
          style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;
                 border:1.5px solid var(--border2,rgba(15,23,42,.12));background:var(--surface2,#f8fafc);
                 color:var(--ink4,#475569);font-size:13px;font-weight:600;cursor:pointer;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--ink2,#1e293b)">${escapeHTML(subject.subject)}</div>
          <div style="font-size:12px;color:var(--ink5,#64748b)">${escapeHTML(cls.class_name)} · ${fmtTimeRange(subject.start_time, subject.end_time)}${subject.room ? ' · ' + escapeHTML(subject.room) : ''}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button id="attRefreshBtn"
          style="display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;
                 border:1.5px solid var(--border2);background:var(--surface2);
                 color:var(--ink4);font-size:13px;font-weight:600;cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Refresh
        </button>
        <button id="attExportBtn"
          style="display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;
                 border:none;background:var(--accent,#1E40AF);
                 color:#fff;font-size:13px;font-weight:600;cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:24px 28px">
      <div id="attendanceStatsRow" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px"></div>
      <div class="card" style="overflow:hidden">
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <h3 style="font-size:14px;font-weight:700;color:var(--ink2)">Attendance Records</h3>
          <div style="display:flex;gap:10px;align-items:center">
            <input id="attDateFilter" type="date" title="Filter by date"
              style="padding:6px 12px;border-radius:6px;border:1.5px solid var(--border2);
                     font-size:13px;outline:none;cursor:pointer;color:var(--ink3)" />
            <input id="attSearchInput" type="text" placeholder="Search student…"
              style="padding:6px 12px;border-radius:6px;border:1.5px solid var(--border2);
                     font-size:13px;outline:none;width:200px" />
          </div>
        </div>
        <div id="attendanceTableWrap" style="overflow-x:auto">
          <div style="padding:32px;text-align:center;color:var(--ink5)">
            <div style="font-size:24px;margin-bottom:8px">⏳</div>
            Loading attendance records…
          </div>
        </div>
      </div>
    </div>`;

  panel.style.display = 'flex';

  document.getElementById('attendanceBackBtn').addEventListener('click', closeAttendanceView);
  document.getElementById('attRefreshBtn').addEventListener('click', () => fetchAttendanceData(cls.id, subject.id));
  document.getElementById('attExportBtn').addEventListener('click', () => exportAttendanceCSV(cls, subject));
  document.getElementById('attSearchInput').addEventListener('input', applyAttendanceFilters);
  document.getElementById('attDateFilter').addEventListener('change', applyAttendanceFilters);

  fetchAttendanceData(cls.id, subject.id);
}

function closeAttendanceView() {
  const panel = document.getElementById('attendancePanel');
  if (panel) panel.style.display = 'none';
  state.currentView = 'dashboard';
}

async function fetchAttendanceData(classId, subjectId) {
  const wrap = document.getElementById('attendanceTableWrap');
  const statsRow = document.getElementById('attendanceStatsRow');
  if (!wrap) return;

  wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--ink5)">Loading…</div>`;

  try {
    const data = await apiFetch(API.subjectAttendance(classId, subjectId));
    let records = data.records || [];

    // subject_id in DB is bigint; subjects use Date.now()+Math.random() as id.
    // Cast both sides to integers for a safe match.
    const sidInt = Math.trunc(Number(subjectId));
    if (sidInt) {
      records = records.filter(r => Math.trunc(Number(r.subject_id)) === sidInt);
    }

    if (records.length === 0) {
      if (statsRow) statsRow.innerHTML = '';
      wrap.innerHTML = `
        <div style="padding:56px 32px;text-align:center">
          <div style="width:64px;height:64px;border-radius:16px;background:#f1f5f9;
                      display:grid;place-items:center;margin:0 auto 16px;font-size:28px">
            📋
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--ink2,#1e293b);margin-bottom:6px">
            No data saved yet
          </div>
          <div style="font-size:13px;color:var(--ink5,#64748b);max-width:280px;margin:0 auto;line-height:1.6">
            Attendance records will appear here once students start checking in for this subject.
          </div>
          <div style="margin-top:20px;display:inline-flex;align-items:center;gap:6px;
                      padding:8px 16px;border-radius:8px;background:#f8fafc;
                      border:1.5px dashed #cbd5e1;font-size:12px;color:var(--ink5,#64748b)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Set a passcode to open attendance for this subject
          </div>
        </div>`;
      return;
    }

    wrap.dataset.records = JSON.stringify(records);
    applyAttendanceFilters();

  } catch (err) {
    wrap.innerHTML = `<div style="padding:32px;text-align:center;color:#ef4444">Error: ${escapeHTML(err.message)}</div>`;
  }
}

function renderAttendanceTable(records) {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap) return;

  // ── Build pivot: students × dates ──────────────────────────────────────
  // Collect unique students (keyed by email or name) and unique dates
  const studentMap = new Map(); // email -> { name, email }
  const dateSet = new Set();

  records.forEach(r => {
    const key   = r.student_email || r.student_name || 'unknown';
    const dObj  = r.created_at ? new Date(r.created_at) : null;
    const dStr  = dObj
      ? dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

    if (!studentMap.has(key)) {
      studentMap.set(key, { name: r.student_name || 'Unknown', email: r.student_email || key });
    }
    if (dStr !== '—') dateSet.add(dStr);
  });

  // Sort dates chronologically
  const dates = [...dateSet].sort((a, b) => new Date(a) - new Date(b));

  // Build lookup: "email|dateStr" -> status
  const cell = {};
  records.forEach(r => {
    const key  = r.student_email || r.student_name || 'unknown';
    const dObj = r.created_at ? new Date(r.created_at) : null;
    const dStr = dObj
      ? dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    if (dStr !== '—') cell[`${key}|${dStr}`] = r.status;
  });

  const students = [...studentMap.values()].sort((a, b) =>
    (a.name || '').localeCompare(b.name || ''));

  // ── Status badge helper ─────────────────────────────────────────────────
  const badge = (status) => {
    if (!status) return `<span style="color:var(--ink5);font-size:12px">—</span>`;
    const map = {
      present: { bg:'#dcfce7', color:'#16a34a', dot:'#22c55e', label:'Present' },
      absent:  { bg:'#fee2e2', color:'#dc2626', dot:'#ef4444', label:'Absent'  },
      late:    { bg:'#fef9c3', color:'#ca8a04', dot:'#eab308', label:'Late'    },
    };
    const s = map[status] || { bg:'#f1f5f9', color:'#64748b', dot:'#94a3b8', label: status };
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;
      border-radius:999px;font-size:11px;font-weight:700;background:${s.bg};color:${s.color}">
      <span style="width:5px;height:5px;border-radius:50%;background:${s.dot};flex-shrink:0"></span>
      ${s.label}
    </span>`;
  };

  // ── Per-student summary ─────────────────────────────────────────────────
  const summary = (email) => {
    let p = 0, a = 0, l = 0;
    dates.forEach(d => {
      const s = cell[`${email}|${d}`];
      if (s === 'present') p++;
      else if (s === 'absent') a++;
      else if (s === 'late') l++;
    });
    const total = p + a + l;
    const pct = total ? Math.round((p / total) * 100) : 0;
    const barColor = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
    return `
      <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
        <div style="width:44px;height:5px;border-radius:99px;background:#e2e8f0;overflow:hidden;flex-shrink:0">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px"></div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${barColor}">${pct}%</span>
        <span style="font-size:10px;color:var(--ink5)">${p}P ${a}A${l ? ' ' + l + 'L' : ''}</span>
      </div>`;
  };

  // ── Sticky header columns ───────────────────────────────────────────────
  const dateHeaders = dates.map(d => {
    const parts = d.split(' ');                          // ["Apr", "5,", "2025"]
    const mon   = parts[0] || '';
    const day   = (parts[1] || '').replace(',', '');
    return `<th style="padding:10px 8px;min-width:80px;text-align:center;
      font-size:10px;font-weight:700;color:var(--ink5);text-transform:uppercase;
      letter-spacing:.07em;border-bottom:2px solid var(--border);
      border-right:1px solid var(--border);background:var(--surface,#fff)">
      <div style="font-size:13px;font-weight:800;color:var(--ink2)">${day}</div>
      <div style="font-size:10px;opacity:.6">${mon}</div>
    </th>`;
  }).join('');

  // ── Student rows ────────────────────────────────────────────────────────
  const rows = students.map((st, idx) => {
    const bg    = idx % 2 === 0 ? '' : 'background:var(--surface2,#f8fafc)';
    const initL = (st.name || '?')[0].toUpperCase();
    const cells = dates.map(d => {
      const s = cell[`${st.email}|${d}`];
      return `<td style="padding:8px;text-align:center;border-right:1px solid var(--border);
        border-bottom:1px solid var(--border)">${badge(s)}</td>`;
    }).join('');

    return `
      <tr data-search="${escapeHTML((st.name + ' ' + st.email).toLowerCase())}" style="${bg}">
        <!-- Sticky student name column -->
        <td style="padding:10px 16px;border-bottom:1px solid var(--border);
          border-right:2px solid var(--border);position:sticky;left:0;
          background:${idx % 2 === 0 ? 'var(--surface,#fff)' : 'var(--surface2,#f8fafc)'};z-index:1;
          min-width:180px;max-width:220px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:28px;height:28px;border-radius:7px;
              background:linear-gradient(135deg,#1E40AF,#6B8AFF);
              display:grid;place-items:center;font-size:11px;font-weight:700;
              color:#fff;flex-shrink:0">${initL}</div>
            <div style="overflow:hidden">
              <div style="font-size:13px;font-weight:600;color:var(--ink2);
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(st.name)}</div>
              <div style="font-size:11px;color:var(--ink5);white-space:nowrap;
                overflow:hidden;text-overflow:ellipsis;font-family:var(--mono)">${escapeHTML(st.email)}</div>
            </div>
          </div>
        </td>
        <!-- Summary column -->
        <td style="padding:8px 14px;border-bottom:1px solid var(--border);
          border-right:2px solid var(--border);white-space:nowrap;
          position:sticky;left:220px;
          background:${idx % 2 === 0 ? 'var(--surface,#fff)' : 'var(--surface2,#f8fafc)'};z-index:1">
          ${summary(st.email)}
        </td>
        ${cells}
      </tr>`;
  }).join('');

  // ── Assemble ────────────────────────────────────────────────────────────
  wrap.innerHTML = `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table style="width:100%;border-collapse:collapse;font-size:13px" id="attTable">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <!-- Student name — sticky -->
            <th style="padding:11px 16px;text-align:left;font-size:11px;font-weight:700;
              color:var(--ink5);text-transform:uppercase;letter-spacing:.07em;
              border-bottom:2px solid var(--border);border-right:2px solid var(--border);
              position:sticky;left:0;background:var(--surface,#fff);z-index:2;min-width:180px">
              Student
            </th>
            <!-- Summary — sticky -->
            <th style="padding:11px 14px;text-align:left;font-size:11px;font-weight:700;
              color:var(--ink5);text-transform:uppercase;letter-spacing:.07em;
              border-bottom:2px solid var(--border);border-right:2px solid var(--border);
              position:sticky;left:220px;background:var(--surface,#fff);z-index:2;white-space:nowrap">
              Summary
            </th>
            ${dateHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function applyAttendanceFilters() {
  const wrap = document.getElementById('attendanceTableWrap');
  const statsRow = document.getElementById('attendanceStatsRow');
  if (!wrap || !wrap.dataset.records) return;

  let records = JSON.parse(wrap.dataset.records);
  const dateFilter = document.getElementById('attDateFilter')?.value;

  // Apply Date Filter
  if (dateFilter) {
    records = records.filter(r => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      const localDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return localDate === dateFilter;
    });
  }

  // Recalculate Stats for filtered view
  const total   = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent  = records.filter(r => r.status === 'absent').length;
  const late    = records.filter(r => r.status === 'late').length;
  const rate    = total ? Math.round((present / total) * 100) : 0;

  if (statsRow) {
    statsRow.innerHTML = [
      { label: 'Total Records',   value: total,      color: '#0EA5E9', bg: '#eff6ff' },
      { label: 'Present',         value: present,    color: '#22c55e', bg: '#f0fdf4' },
      { label: 'Absent',          value: absent,     color: '#ef4444', bg: '#fef2f2' },
      { label: 'Attendance Rate', value: rate + '%', color: '#f59e0b', bg: '#fffbeb' },
    ].map(s => `
      <div style="background:${s.bg};border:1px solid ${s.color}22;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.04)">
        <div style="font-size:11px;font-weight:600;color:${s.color};text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${s.label}</div>
        <div style="font-size:26px;font-weight:700;color:${s.color};line-height:1">${s.value}</div>
      </div>`).join('');
  }

  if (records.length === 0) {
    wrap.innerHTML = `
      <div style="padding:40px 20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">📅</div>
        <div style="font-size:14px;font-weight:600;color:var(--ink2)">No records found</div>
        <div style="font-size:13px;color:var(--ink5)">Try adjusting your date filter or search query.</div>
      </div>`;
    return;
  }

  // Render filtered Table
  renderAttendanceTable(records);

  // Apply Student Name/Email Search Filter visually
  const query = document.getElementById('attSearchInput')?.value.toLowerCase() || '';
  document.querySelectorAll('#attTable tbody tr').forEach(row => {
    row.style.display = row.dataset.search?.includes(query) ? '' : 'none';
  });
}

function exportAttendanceCSV(cls, subject) {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap?.dataset.records) { showToast('No records to export', 'error'); return; }
  
  let records = JSON.parse(wrap.dataset.records);
  const dateFilter = document.getElementById('attDateFilter')?.value;
  
  if (dateFilter) {
    records = records.filter(r => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      const localDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return localDate === dateFilter;
    });
  }
  
  const header  = ['Student Name', 'Email', 'Date', 'Time', 'Status'];
  const rows    = records.map(r => {
    const d = r.created_at ? new Date(r.created_at) : null;
    return [
      r.student_name || '',
      r.student_email || '',
      d ? d.toLocaleDateString() : '',
      d ? d.toLocaleTimeString() : '',
      r.status || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${cls.class_name}_${subject.subject}_attendance.csv`.replace(/\s+/g, '_');
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===========================
// PASSCODE MODAL
// ===========================

function openPasscodeModal(classId, className) {
  let modal = document.getElementById('passcodeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'passcodeModal';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(15,23,42,.75);backdrop-filter:blur(4px);
                z-index:1300;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:var(--surface,#fff);border-radius:12px;padding:28px;
                  max-width:420px;width:100%;position:relative;box-shadow:0 8px 32px rgba(0,0,0,.15)">
        <button id="closePasscodeModal"
          style="position:absolute;top:16px;right:16px;border:none;background:none;
                 font-size:20px;cursor:pointer;color:var(--ink5);line-height:1">×</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:38px;height:38px;border-radius:10px;background:#eff6ff;
                      display:grid;place-items:center;flex-shrink:0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E40AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--ink2)">Set Attendance Passcode</div>
            <div style="font-size:12px;color:var(--ink5)">${escapeHTML(className)}</div>
          </div>
        </div>
        <div style="margin-bottom:18px">
          <label style="display:block;font-size:12px;font-weight:600;color:var(--ink4);margin-bottom:6px">New Passcode</label>
          <div style="position:relative">
            <input id="passcodeInput" type="password" maxlength="20"
              placeholder="Enter passcode for this session"
              style="width:100%;padding:10px 40px 10px 12px;border:1.5px solid var(--border2);
                     border-radius:8px;font-size:14px;font-family:var(--mono);outline:none;
                     transition:border .15s,box-shadow .15s;box-sizing:border-box" />
            <button id="togglePasscodeVisibility"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
                     background:none;border:none;cursor:pointer;padding:4px;color:var(--ink5)">
              <svg id="eyeIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--ink5)">
            Students will need this code to mark their attendance.
          </div>
        </div>
        <div style="margin-bottom:18px">
          <label style="display:block;font-size:12px;font-weight:600;color:var(--ink4);margin-bottom:6px">Passcode Duration <span style="color:red">*</span></label>
          <div style="display:flex;gap:8px">
            <input id="durationSelect" type="number" min="0" value="5"
              style="width:80px;padding:10px 12px;border:1.5px solid var(--border2);border-radius:8px;
                     font-size:14px;outline:none;transition:border .15s,box-shadow .15s;box-sizing:border-box;
                     background:white;color:var(--ink2);text-align:center" />
            <span style="display:flex;align-items:center;font-size:13px;color:var(--ink4);font-weight:600">Min</span>
            <input id="durationSeconds" type="number" min="0" max="59" value="0"
              style="width:80px;padding:10px 12px;border:1.5px solid var(--border2);border-radius:8px;
                     font-size:14px;outline:none;transition:border .15s,box-shadow .15s;box-sizing:border-box;
                     background:white;color:var(--ink2);text-align:center" />
            <span style="display:flex;align-items:center;font-size:13px;color:var(--ink4);font-weight:600">Sec</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--ink5)">
            Passcode will expire after the selected time. Set to 0 for "Until Manually Closed".
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="cancelPasscodeBtn"
            style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--border2);
                   background:none;font-size:13px;font-weight:600;cursor:pointer;color:var(--ink4)">
            Cancel
          </button>
          <button id="savePasscodeBtn"
            style="flex:1;padding:10px;border-radius:8px;border:none;
                   background:var(--accent,#1E40AF);color:#fff;
                   font-size:13px;font-weight:600;cursor:pointer">
            Save Passcode
          </button>
        </div>
      </div>
    </div>`;

  const input      = modal.querySelector('#passcodeInput');
  const saveBtn    = modal.querySelector('#savePasscodeBtn');
  const cancelBtn  = modal.querySelector('#cancelPasscodeBtn');
  const closeBtn   = modal.querySelector('#closePasscodeModal');
  const toggleVis  = modal.querySelector('#togglePasscodeVisibility');
  const durationSelect = modal.querySelector('#durationSelect');
  const durationSeconds = modal.querySelector('#durationSeconds');

  input.focus();

  input.addEventListener('focus', () => {
    input.style.borderColor = 'var(--accent,#1E40AF)';
    input.style.boxShadow   = '0 0 0 3px rgba(30,64,175,.1)';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = '';
    input.style.boxShadow   = '';
  });

  durationSeconds.addEventListener('focus', () => {
    durationSeconds.style.borderColor = 'var(--accent,#1E40AF)';
    durationSeconds.style.boxShadow   = '0 0 0 3px rgba(30,64,175,.1)';
  });
  durationSeconds.addEventListener('blur', () => {
    durationSeconds.style.borderColor = '';
    durationSeconds.style.boxShadow   = '';
  });

  durationSelect.addEventListener('focus', () => {
    durationSelect.style.borderColor = 'var(--accent,#1E40AF)';
    durationSelect.style.boxShadow   = '0 0 0 3px rgba(30,64,175,.1)';
  });
  durationSelect.addEventListener('blur', () => {
    durationSelect.style.borderColor = '';
    durationSelect.style.boxShadow   = '';
  });


  toggleVis.addEventListener('click', () => {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    modal.querySelector('#eyeIcon').innerHTML = isPass
      ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  const close = () => modal.remove();
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  saveBtn.addEventListener('click', async () => {
    const passcode = input.value.trim();
    let min = parseFloat(durationSelect.value) || 0;
    let sec = parseFloat(durationSeconds.value) || 0;
    
    if (!passcode) { showToast('Please enter a passcode', 'error'); input.focus(); return; }
    
    if (min < 0) min = 0;
    if (sec < 0) sec = 0;
    let duration = min + (sec / 60);
    
    await withLoading(saveBtn, 'Saving…', async () => {
      try {
        const data = await apiFetch(API.updatePasscode(classId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode, duration }),
        });
        if (!data.success) throw new Error(data.error || 'Failed to save passcode');
        
        // Format toast message
        let durationText = '';
        if (duration > 0) {
          const totalSeconds = Math.round(duration * 60);
          if (totalSeconds >= 3600) {
            durationText = ` Expires in ${(totalSeconds / 3600).toFixed(1)} hours.`;
          } else if (totalSeconds >= 60) {
            durationText = ` Expires in ${Math.round(totalSeconds / 60)} minutes.`;
          } else {
            durationText = ` Expires in ${totalSeconds} seconds.`;
          }
        }
        showToast('Passcode saved!' + durationText, 'success');
        
        // Show timer in subjects wrapper if duration > 0
        if (duration > 0) {
          const timerSection = document.getElementById(`timer-section-${classId}`);
          const timerDisplay = document.getElementById(`timer-display-${classId}`);
          if (timerSection && timerDisplay) {
            timerSection.style.display = 'flex';
            
            // Stop any existing timer for this class
            if (state.activeTimers[classId]) {
              clearInterval(state.activeTimers[classId].intervalId);
            }
            
            // Start new countdown
            let remainingMinutes = duration;
            const formatTime = (minutes) => {
              const m = Math.floor(minutes);
              const s = Math.floor((minutes - m) * 60);
              return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            };
            
            state.activeTimers[classId] = {
              intervalId: null,
              remainingMinutes: remainingMinutes,
              isPaused: false
            };
            
            const startCountdown = () => {
              state.activeTimers[classId].intervalId = setInterval(() => {
                if (!state.activeTimers[classId].isPaused) {
                  state.activeTimers[classId].remainingMinutes -= 1/60;
                  timerDisplay.textContent = formatTime(state.activeTimers[classId].remainingMinutes);
                  
                  // Add pulsing as time runs out
                  if (state.activeTimers[classId].remainingMinutes < 1) {
                    timerDisplay.style.animation = 'pulse 1s infinite';
                  }
                  
                  // Expire when time runs out
                  if (state.activeTimers[classId].remainingMinutes <= 0) {
                    clearInterval(state.activeTimers[classId].intervalId);
                    timerSection.style.display = 'none';
                    
                    // Clear passcode from database
                    apiFetch(API.updatePasscode(classId), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ passcode: null, duration: 0 }),
                    }).catch(err => console.error('Failed to clear expired passcode:', err));
                    
                    showToast('Passcode expired!', 'info');
                    delete state.activeTimers[classId];
                  }
                }
              }, 1000);
            };
            
            startCountdown();
          }
        }
        
        close();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });

  // Allow Enter key to save
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });
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
  
  const timer = state.activeTimers[classId];
  clearInterval(timer.intervalId);
  
  const timerSection = document.getElementById(`timer-section-${classId}`);
  if (timerSection) {
    timerSection.style.display = 'none';
  }
  
  delete state.activeTimers[classId];
  
  // Clear passcode from database
  try {
    await apiFetch(API.updatePasscode(classId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: null, duration: 0 }),
    });
  } catch (err) {
    console.error('Failed to clear passcode:', err);
  }
  
  showToast('Passcode stopped.', 'info');
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
    // 1. Mark session as inactive in DB
    await apiFetch(`/api/attendance-sessions/${sessionId}/stop`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });

    // 2. Clear the passcode from the class if classId is known
    if (classId) {
      await apiFetch(API.updatePasscode(classId), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ passcode: null, duration: 0 }),
      }).catch(() => {}); // non-fatal
    }

    // 3. Stop any running frontend timer
    if (classId && state.activeTimers[classId]) {
      clearInterval(state.activeTimers[classId].intervalId);
      delete state.activeTimers[classId];
      const timerSection = document.getElementById(`timer-section-${classId}`);
      if (timerSection) timerSection.style.display = 'none';
    }

    showToast('Session ended.', 'info');
    loadSessions(); // refresh the list
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
              await apiFetch(API.updatePasscode(classId), {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ passcode: null, duration: 0 }),
              }).catch(() => {});
              showToast('Session expired.', 'info');
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

    const notifBtn = document.getElementById('notifBtn');
    let dot = notifBtn?.querySelector('.notif-dot');
    if (!dot && notifBtn) {
      dot = document.createElement('div');
      dot.className = 'notif-dot';
      dot.style.cssText = 'position:absolute;top:6px;right:8px;width:8px;height:8px;background:#ef4444;border-radius:50%;';
      notifBtn.appendChild(dot);
    }
    
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;
    
    let container = dropdown.querySelector('.card-body');
    if (!container) {
      dropdown.innerHTML = '<div class="card-body" style="padding:0;max-height:300px;overflow-y:auto"></div>';
      container = dropdown.querySelector('.card-body');
    }

    if (reqs.length > 0) {
      if (dot) dot.style.display = 'block';
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
      if (dot) dot.style.display = 'none';
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink5);font-size:13px">No pending enrollment requests.</div>';
    }
    
    updatePendingEnrollmentsBox(reqs);
  } catch (e) {
    console.error('Failed to load notifications:', e);
  }
}

function updatePendingEnrollmentsBox(reqs) {
  let box = document.getElementById('pendingEnrollmentsBox');
  
  if (!box) {
    box = document.createElement('div');
    box.id = 'pendingEnrollmentsBox';
    box.className = 'card';
    box.style.cssText = 'margin-top: 20px; margin-bottom: 24px; overflow: hidden;';
    
    // Ilagay ang box direkta sa ilalim ng "My Classes"
    const classList = document.getElementById('classList');
    if (classList) {
      const parentCard = classList.closest('.card') || classList;
      if (parentCard.parentNode) {
        parentCard.parentNode.insertBefore(box, parentCard.nextSibling);
      }
    } else {
      const dashGrid = document.querySelector('.dash-grid');
      if (dashGrid) {
        dashGrid.appendChild(box);
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
      updateTeacherNotifications();
      if (window.loadClasses) loadClasses(); // update subjects list
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