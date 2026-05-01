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

// ===========================
// TIME
// ===========================

function updateTime() {
  const el = document.getElementById('liveTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
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
  }

  // Close both when clicking anywhere else — same as student dashboard
  window.addEventListener('click', function() {
    if (notifDropdown)   notifDropdown.style.display   = 'none';
    if (profileDropdown) profileDropdown.style.display = 'none';
  });

  // ── Logout ──
  var lb = document.getElementById('logoutBtn');
  if (lb) lb.onclick = function() { window.location.href = '/logout'; };

  document.getElementById('classList')?.addEventListener('click', handleClassListClick);
  loadClasses().catch(console.error);
  loadSessions().catch(console.error);
});
  document.getElementById('logoutBtn')?.addEventListener('click', () => { window.location.href = '/logout'; });
  document.getElementById('classList')?.addEventListener('click', handleClassListClick);
  loadClasses().catch(console.error);
  loadSessions().catch(console.error);

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
        row.innerHTML = `
          <span class="sb-subject-dot"></span>
          <span class="sb-subject-name">${escapeHTML(sub.subject)}</span>
          ${timeStr ? `<span class="sb-subject-time">${timeStr}</span>` : ''}`;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          openAttendanceView(cls, sub);
        });
        
        // Enrollment code button for this subject
        const enrollBtn = document.createElement('button');
        enrollBtn.style.cssText = `
          flex-shrink:0;padding:5px 8px;border-radius:6px;border:1px solid rgba(59,130,246,0.2);
          background:none;color:rgba(59,130,246,0.7);cursor:pointer;font-size:11px;
          display:flex;align-items:center;justify-content:center;transition:background .15s, color .15s;
          width:32px;height:32px`;
        enrollBtn.title = 'Show enrollment code and subject ID';
        enrollBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
        enrollBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEnrollmentModal(cls, sub);
        });
        enrollBtn.addEventListener('mouseover', () => {
          enrollBtn.style.background = 'rgba(59,130,246,0.15)';
          enrollBtn.style.color = 'rgba(59,130,246,1)';
        });
        enrollBtn.addEventListener('mouseout', () => {
          enrollBtn.style.background = 'none';
          enrollBtn.style.color = 'rgba(59,130,246,0.7)';
        });
        
        // Passcode button for this subject
        const passBtn = document.createElement('button');
        passBtn.style.cssText = `
          flex-shrink:0;padding:5px 8px;border-radius:6px;border:1px solid rgba(250,180,60,0.2);
          background:none;color:rgba(250,180,60,0.7);cursor:pointer;font-size:11px;
          display:flex;align-items:center;justify-content:center;transition:background .15s, color .15s;
          width:32px;height:32px`;
        passBtn.title = 'Set attendance passcode for this subject';
        passBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`;
        passBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openPasscodeModal(cls.id, cls.class_name);
        });
        passBtn.addEventListener('mouseover', () => {
          passBtn.style.background = 'rgba(250,180,60,0.15)';
          passBtn.style.color = 'rgba(250,180,60,1)';
        });
        passBtn.addEventListener('mouseout', () => {
          passBtn.style.background = 'none';
          passBtn.style.color = 'rgba(250,180,60,0.7)';
        });
        
        rowWrapper.appendChild(row);
        rowWrapper.appendChild(enrollBtn);
        rowWrapper.appendChild(passBtn);
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
          <input id="attSearchInput" type="text" placeholder="Search student…"
            style="padding:6px 12px;border-radius:6px;border:1.5px solid var(--border2);
                   font-size:13px;outline:none;width:200px" />
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
  document.getElementById('attSearchInput').addEventListener('input', filterAttendanceTable);

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
    renderAttendanceTable(records);

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

function filterAttendanceTable() {
  const query = document.getElementById('attSearchInput')?.value.toLowerCase() || '';
  const rows  = document.querySelectorAll('#attTable tbody tr');
  rows.forEach(row => {
    row.style.display = row.dataset.search?.includes(query) ? '' : 'none';
  });
}

function exportAttendanceCSV(cls, subject) {
  const wrap = document.getElementById('attendanceTableWrap');
  if (!wrap?.dataset.records) { showToast('No records to export', 'error'); return; }
  const records = JSON.parse(wrap.dataset.records);
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
            <select id="durationSelect"
              style="flex:1;padding:10px 12px;border:1.5px solid var(--border2);border-radius:8px;
                     font-size:13px;outline:none;transition:border .15s,box-shadow .15s;box-sizing:border-box;
                     background:white;color:var(--ink2);cursor:pointer">
              <option value="5">5 Minutes</option>
              <option value="10">10 Minutes</option>
              <option value="15">15 Minutes</option>
              <option value="30">30 Minutes</option>
              <option value="60">1 Hour</option>
              <option value="120">2 Hours</option>
              <option value="180">3 Hours</option>
              <option value="0">Until Manually Closed</option>
              <option value="custom">Custom (Seconds)</option>
            </select>
            <input id="customDurationInput" type="number" min="1" placeholder="Seconds" 
              style="width:120px;padding:10px 12px;border:1.5px solid var(--border2);border-radius:8px;
                     font-size:13px;outline:none;transition:border .15s,box-shadow .15s;box-sizing:border-box;
                     display:none" />
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--ink5)">
            Passcode will automatically expire after the selected time.
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

  input.focus();

  input.addEventListener('focus', () => {
    input.style.borderColor = 'var(--accent,#1E40AF)';
    input.style.boxShadow   = '0 0 0 3px rgba(30,64,175,.1)';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = '';
    input.style.boxShadow   = '';
  });

  durationSelect.addEventListener('focus', () => {
    durationSelect.style.borderColor = 'var(--accent,#1E40AF)';
    durationSelect.style.boxShadow   = '0 0 0 3px rgba(30,64,175,.1)';
  });
  durationSelect.addEventListener('blur', () => {
    durationSelect.style.borderColor = '';
    durationSelect.style.boxShadow   = '';
  });

  const customDurationInput = modal.querySelector('#customDurationInput');
  
  // Show/hide custom input when Custom is selected
  durationSelect.addEventListener('change', () => {
    if (durationSelect.value === 'custom') {
      customDurationInput.style.display = 'block';
      customDurationInput.focus();
    } else {
      customDurationInput.style.display = 'none';
    }
  });

  customDurationInput.addEventListener('focus', () => {
    customDurationInput.style.borderColor = 'var(--accent,#1E40AF)';
    customDurationInput.style.boxShadow   = '0 0 0 3px rgba(30,64,175,.1)';
  });
  customDurationInput.addEventListener('blur', () => {
    customDurationInput.style.borderColor = '';
    customDurationInput.style.boxShadow   = '';
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
    let duration = durationSelect.value;
    
    if (!passcode) { showToast('Please enter a passcode', 'error'); input.focus(); return; }
    
    // Handle custom duration
    if (duration === 'custom') {
      const customSeconds = parseInt(customDurationInput.value);
      if (!customSeconds || customSeconds < 1) {
        showToast('Please enter a valid number of seconds', 'error');
        customDurationInput.focus();
        return;
      }
      duration = customSeconds / 60; // Convert seconds to minutes
    } else {
      duration = parseInt(duration);
    }
    
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
  ['subjectNameInput','subjectStartTime','subjectEndTime','subjectRoomInput']
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

  // Push to buffer
  state.classSubjectsBuffer.push({
    subject:    subjectName,
    start_time: startTime || '00:00',
    end_time:   endTime   || '00:00',
    room:       room      || 'TBD',
    days:       selectedDays,
  });

  // Clear inputs for next subject
  ['subjectNameInputClass', 'subjectStartTimeClass', 'subjectEndTimeClass', 'subjectRoomInputClass']
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
        style="border:none;background:#ef4444;color:white;cursor:pointer;
               width:42px;border-radius:8px;display:flex;align-items:center;
               justify-content:center;font-size:16px;flex-shrink:0;transition:background .2s"
        onmouseover="this.style.background='#dc2626'"
        onmouseout="this.style.background='#ef4444'"
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
            <!-- Passcode button -->
            <button type="button"
              style="flex-shrink:0;width:32px;height:32px;border-radius:6px;
                     border:1px solid rgba(250,180,60,0.3);background:none;
                     color:rgba(250,180,60,0.8);cursor:pointer;display:flex;
                     align-items:center;justify-content:center;transition:all .15s"
              title="Set passcode"
              onclick="openPasscodeModal(${c.id}, '${escapeHTML(c.class_name).replace(/'/g,"\\'")}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </button>
            <!-- Start Session button -->
<button type="button"
  style="flex-shrink:0;width:32px;height:32px;border-radius:6px;
         border:1px solid rgba(34,197,94,0.3);background:none;
         color:rgba(34,197,94,0.8);cursor:pointer;display:flex;
         align-items:center;justify-content:center;transition:all .15s"
  title="Start attendance session for this subject"
  onclick="startSubjectSession(${c.id}, '${escapeHTML(c.class_name).replace(/'/g,"\\'")}', ${s.id}, '${escapeHTML(s.subject).replace(/'/g,"\\'")}')">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
    <circle cx="12" cy="12" r="10"/>
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
  </svg>
            </button>
            <!-- Delete subject button -->
            <button type="button"
              data-action="delete-subject"
              data-class-id="${c.id}"
              data-subject-id="${s.id}"
              style="flex-shrink:0;width:32px;height:32px;border-radius:6px;
                     border:1px solid rgba(239,68,68,0.3);background:none;
                     color:rgba(239,68,68,0.8);cursor:pointer;display:flex;
                     align-items:center;justify-content:center;transition:all .15s"
              title="Delete subject">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
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

  } catch (err) {
    classList.innerHTML = `<div class="class-item" style="cursor:default;color:#ef4444">Error: ${escapeHTML(err.message)}</div>`;
  }
}

function selectClass(classId) {
  state.selectedClassId = classId;
  const cls = state.classesData.find(c => c.id === classId);
  if (cls) {
    document.getElementById('selectedClassName').textContent = escapeHTML(cls.class_name);
    document.getElementById('selectedClassMeta').textContent = cls.schedule ? `Days: ${cls.schedule}` : '';
    document.getElementById('selectedClassInfo').style.display = 'flex';
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
    document.getElementById('selectedClassInfo').style.display = 'none';
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
      container.innerHTML = '<div style="padding:14px;text-align:center;color:var(--ink4)">No attendance sessions yet.</div>';
      return;
    }

    container.innerHTML = data.sessions.map(session => {
      const isActive = session.is_active !== false; // treat null as active
      const className = session.class_name || `Class ${session.class_id || '—'}`;
      const created = new Date(session.created_at).toLocaleString();
      const code = session.session_password || session.session_code || '—';

      return `
        <div style="padding:12px 14px;border-bottom:1px solid var(--border,#e2e8f0);
                    display:flex;justify-content:space-between;align-items:center;gap:10px">
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
              Code: <strong style="font-family:monospace">${escapeHTML(code)}</strong>
              · ${created}
            </div>
          </div>
          ${isActive ? `
            <button
              onclick="endSession(${session.id}, ${session.class_id || 'null'})"
              style="flex-shrink:0;padding:6px 14px;border:none;background:#ef4444;
                     color:white;border-radius:6px;cursor:pointer;font-size:12px;
                     font-weight:600;white-space:nowrap">
              End Session
            </button>` : ''}
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
        <select id="subjectSessionDuration"
          style="width:100%;padding:10px 12px;border:1.5px solid var(--border2,#e2e8f0);
                 border-radius:8px;font-size:13px;outline:none;
                 background:white;color:var(--ink2);cursor:pointer;box-sizing:border-box">
          <option value="15">15 Minutes</option>
          <option value="30" selected>30 Minutes</option>
          <option value="60">1 Hour</option>
          <option value="120">2 Hours</option>
          <option value="0">Until Manually Stopped</option>
        </select>
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
    const duration = parseInt(document.getElementById('subjectSessionDuration').value);
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
  document.getElementById('teacherSchedulePanel').style.display = 'block';

  // Update header
  const pt = document.getElementById('pageTitle');
  const ps = document.getElementById('pageSub');
  if (pt) pt.textContent = 'Schedule';
  if (ps) ps.textContent = 'Your weekly timetable';

  // Sync nav active state
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('scheduleNavBtn')?.classList.add('active');

  // Classes must be loaded first; loadClasses() already runs on DOMContentLoaded
  renderTeacherScheduleGrid();
}

function showSettingsView() {
  document.querySelector('.dash-grid')?.style.setProperty('display', 'none');
  document.getElementById('teacherSchedulePanel').style.display = 'none';
  document.getElementById('teacherSettingsPanel').style.display = 'block';

  const pt = document.getElementById('pageTitle');
  const ps = document.getElementById('pageSub');
  if (pt) pt.textContent = 'Settings';
  if (ps) ps.textContent = 'Profile & Preferences';

  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('settingsNavBtn')?.classList.add('active');
}

function showDashboardView() {
  document.querySelector('.dash-grid')?.style.setProperty('display', '');
  document.getElementById('teacherSchedulePanel').style.display = 'none';
  document.getElementById('teacherSettingsPanel').style.display = 'none';

  const pt = document.getElementById('pageTitle');
  const ps = document.getElementById('pageSub');
  if (pt) pt.textContent = 'Dashboard';
  if (ps) ps.textContent = 'Welcome back';

  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.querySelector('.nav-item[href="#dashboard"]')?.classList.add('active');

  const teacherName = document.querySelector('.student-name')?.textContent?.trim() || '';
  updateGreeting(teacherName);
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

async function updateTeacherNotifications() {
  try {
    const res = await apiFetch('/api/pending-enrollments');
    const reqs = res.requests || [];
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
  } catch (e) {
    console.error('Failed to load notifications:', e);
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