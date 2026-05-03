(function init() {
  const now = new Date();
  const h = now.getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('dashGreeting');
  if (el) el.textContent = greet + ', Admin 👋';

  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateEl = document.getElementById('headerDate');
  if (dateEl) dateEl.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ' ' + now.getFullYear();
})();

/* ──────────────────────────────────────────
   NAVIGATION
────────────────────────────────────────── */
function switchView(id, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  btn.classList.add('active');
  const title = btn.cloneNode(true);
  title.querySelectorAll('.chip').forEach(c => c.remove());
  document.getElementById('headerTitle').textContent = title.textContent.trim();
  document.getElementById('sidebar').classList.remove('open');

  if (id === 'students')      loadStudents();
  if (id === 'teachers')      loadTeachers();
  if (id === 'users')         loadAllUsers();
  if (id === 'logs')          loadAttendanceLogs();
  if (id === 'registrations') loadPendingRegistrations();
}

/* ──────────────────────────────────────────
   MOBILE SIDEBAR
────────────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ──────────────────────────────────────────
   TOAST
────────────────────────────────────────── */
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ──────────────────────────────────────────
   TEACHER ACCORDION
────────────────────────────────────────── */
function toggleSched(id) {
  const s   = document.getElementById('sched-' + id);
  const ico = document.getElementById('ico-' + id);
  const open = s.style.display !== 'none';
  s.style.display = open ? 'none' : 'block';
  ico.classList.toggle('open', !open);
}

/* ──────────────────────────────────────────
   TABLE SEARCH / FILTER
────────────────────────────────────────── */
function filterTable(tbodyId, search, role) {
  search = (search || '').toLowerCase();
  role   = (role   || '').toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach(row => {
    const txt = (row.dataset.search || row.textContent).toLowerCase();
    const matchSearch = !search || txt.includes(search);
    const matchRole   = !role   || txt.includes(role);
    row.style.display = (matchSearch && matchRole) ? '' : 'none';
  });
}

/* ──────────────────────────────────────────
   REMOVE ROW
────────────────────────────────────────── */
function removeRow(btn, type) {
  const row = btn.closest('tr');
  row.style.transition = 'opacity .25s';
  row.style.opacity = '0';
  setTimeout(() => row.remove(), 260);
  toast((type === 'student' ? 'Student' : 'Teacher') + ' removed.');
}

/* ──────────────────────────────────────────
   REGISTRATIONS
────────────────────────────────────────── */
let pendingCount = 0;

// Helper: pick a consistent color from a UUID string (fixes the NaN bug
// that happened when doing uuid % number — UUIDs are not numbers).
function colorFromId(id) {
  const colors = ['var(--accent)', '#e91e8c', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];
  // Sum the char codes of the id string to get a stable numeric index
  const sum = String(id).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

function updatePendingBadges() {
  const badge = document.getElementById('sbPendingBadge');
  const chip  = document.getElementById('pendingChip');
  const dash  = document.getElementById('dPending');

  if (chip)  chip.textContent  = pendingCount > 0 ? pendingCount + ' pending' : 'None';
  if (dash)  dash.textContent  = pendingCount;

  if (badge) {
    badge.textContent    = pendingCount;
    badge.style.display  = pendingCount > 0 ? '' : 'none';   // always reset display first
  }
}

async function loadPendingRegistrations() {
  const regList = document.getElementById('regList');
  regList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">Loading…</div>';

  try {
    const response = await fetch('/api/admin/registrations');
    if (!response.ok) throw new Error('Failed to fetch registrations');
    const registrations = await response.json();

    regList.innerHTML = '';
    pendingCount = registrations.length;
    updatePendingBadges();

    // Empty state
    if (registrations.length === 0) {
      regList.innerHTML = `
        <div style="text-align:center;padding:36px 16px;color:var(--text3)">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 12px;display:block;opacity:.4">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <div style="font-size:14px;font-weight:700;color:var(--text2);margin-bottom:4px">All caught up!</div>
          <div style="font-size:12px">No pending registrations right now.</div>
        </div>`;
      return;
    }

    registrations.forEach(reg => {
      const color    = colorFromId(reg.id);
      // reg.fullname comes from user_metadata.name which is stored as "Lastname, Firstname"
      const initials = reg.fullname.split(/[\s,]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const type     = reg.role === 'student' ? 'Student' : 'Teacher';
      const details  = reg.role === 'student'
        ? [reg.course, reg.section].filter(Boolean).join(' · ')
        : reg.course || '';

      // Email-verified badge
      const verifiedBadge = `<span style="
        display:inline-flex;align-items:center;gap:3px;
        background:var(--green-bg);color:var(--green);
        font-size:10px;font-weight:700;
        padding:2px 7px;border-radius:99px;margin-left:6px">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
             stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Email Verified
      </span>`;

      const item = document.createElement('div');
      item.className      = 'reg-item';
      item.dataset.id     = reg.id;
      item.dataset.type   = reg.role;
      item.innerHTML = `
        <div class="avatar" style="background:${color};width:36px;height:36px;font-size:11px;flex-shrink:0">${initials}</div>
        <div class="reg-info">
          <div class="reg-name">
            ${escHtml(reg.fullname)}
            ${verifiedBadge}
          </div>
          <div class="reg-sub">
            ${type} · Applied ${new Date(reg.created_at).toLocaleDateString()}
            ${details ? ' · ' + escHtml(details) : ''}
            · ${escHtml(reg.email)}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-xs btn-success" onclick="handleReg(this,'accept')">✓ Accept</button>
          <button class="btn btn-xs btn-danger"  onclick="handleReg(this,'decline')">✕ Decline</button>
        </div>`;
      regList.appendChild(item);
    });

  } catch (error) {
    console.error('Error loading registrations:', error);
    regList.innerHTML = `<div style="text-align:center;padding:24px;color:var(--red);font-size:13px">
      Failed to load registrations. Please try again.</div>`;
    toast('Error loading registrations');
  }
}

async function handleReg(btn, action) {
  const item = btn.closest('.reg-item');
  const userId = item.dataset.id;

  // Disable both buttons while the request is in flight
  item.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '.5'; });

  try {
    const endpoint = action === 'accept'
      ? `/api/admin/accept-registration/${userId}`
      : `/api/admin/decline-registration/${userId}`;

    const response = await fetch(endpoint, { method: 'POST' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Server error');
    }

    item.style.transition = 'opacity .25s, transform .25s';
    item.style.opacity    = '0';
    item.style.transform  = 'translateX(12px)';
    item.style.pointerEvents = 'none';
    setTimeout(() => {
      item.remove();
      pendingCount = Math.max(0, pendingCount - 1);
      updatePendingBadges();

      // Show empty state if nothing left
      const regList = document.getElementById('regList');
      if (regList && regList.querySelectorAll('.reg-item').length === 0) {
        regList.innerHTML = `
          <div style="text-align:center;padding:36px 16px;color:var(--text3)">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 12px;display:block;opacity:.4">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div style="font-size:14px;font-weight:700;color:var(--text2);margin-bottom:4px">All caught up!</div>
            <div style="font-size:12px">No pending registrations right now.</div>
          </div>`;
      }
    }, 280);

    toast(action === 'accept' ? '✓ Registration accepted!' : '✕ Registration declined.');
  } catch (error) {
    console.error('Error:', error);
    toast('Error: ' + error.message);
    // Re-enable buttons on failure
    item.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }
}

function bulkApprove() {
  const items = [...document.querySelectorAll('#regList .reg-item')].filter(i => i.style.display !== 'none');
  if (!items.length) { toast('Nothing to approve.'); return; }
  items.forEach(i => i.querySelector('.btn-success')?.click());
}

function bulkDecline() {
  const items = [...document.querySelectorAll('#regList .reg-item')].filter(i => i.style.display !== 'none');
  if (!items.length) { toast('Nothing to decline.'); return; }
  if (!confirm('Decline all visible registrations?')) return;
  items.forEach(i => i.querySelector('.btn-danger')?.click());
}

function filterReg(type) {
  document.querySelectorAll('#regList .reg-item').forEach(i => {
    i.style.display = (type === 'all' || i.dataset.type === type) ? '' : 'none';
  });
  ['rbAll', 'rbStu', 'rbTea'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.style.background  = '';
    b.style.color       = '';
    b.style.borderColor = '';
  });
  const map = { all: 'rbAll', student: 'rbStu', teacher: 'rbTea' };
  const ab = document.getElementById(map[type]);
  if (ab) {
    ab.style.background  = 'var(--accent)';
    ab.style.color       = '#fff';
    ab.style.borderColor = 'var(--accent)';
  }
}
filterReg('all');

/* ──────────────────────────────────────────
   LOAD DATA FROM SUPABASE
────────────────────────────────────────── */
async function loadStudents() {
  try {
    const response = await fetch('/api/admin/students');
    if (!response.ok) throw new Error('Failed to fetch students');
    const students = await response.json();
    const tbody = document.getElementById('studentsTbody');
    tbody.innerHTML = '';

    if (!students.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">No students found.</td></tr>';
      return;
    }

    students.forEach(s => {
      const initials = s.name.split(/[\s,]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const color = colorFromId(s.id);
      const row = document.createElement('tr');
      row.dataset.search = (s.name + ' ' + s.id + ' ' + (s.course || '') + ' ' + (s.section || '')).toLowerCase();
      row.innerHTML = `
        <td><div class="name-cell">
          <div class="avatar" style="background:${color};width:30px;height:30px;font-size:10px">${initials}</div>
          ${escHtml(s.name)}
        </div></td>
        <td class="mono">${escHtml(s.id)}</td>
        <td>${escHtml(s.course || '')}</td>
        <td><span class="chip chip-section">${escHtml(s.section || 'N/A')}</span></td>
        <td><button class="btn btn-xs btn-danger" onclick="removeRow(this,'student')">Remove</button></td>`;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading students:', error);
    toast('Error loading students');
  }
}

async function loadTeachers() {
  try {
    const response = await fetch('/api/admin/teachers');
    if (!response.ok) throw new Error('Failed to fetch teachers');
    const teachers = await response.json();
    const tbody = document.getElementById('teachersTbody');
    tbody.innerHTML = '';

    if (!teachers.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px">No teachers found.</td></tr>';
      return;
    }

    teachers.forEach(t => {
      const initials = t.name.split(/[\s,]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const color = colorFromId(t.id);
      const row = document.createElement('tr');
      row.dataset.search = (t.name + ' ' + t.id + ' ' + (t.subject || '')).toLowerCase();
      row.innerHTML = `
        <td><div class="name-cell">
          <div class="avatar" style="background:${color};width:30px;height:30px;font-size:10px">${initials}</div>
          ${escHtml(t.name)}
        </div></td>
        <td class="mono">${escHtml(t.id)}</td>
        <td>${escHtml(t.subject || '')}</td>
        <td><button class="btn btn-xs btn-danger" onclick="removeRow(this,'teacher')">Remove</button></td>`;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading teachers:', error);
    toast('Error loading teachers');
  }
}

async function loadAllUsers() {
  try {
    const response = await fetch('/api/admin/users');
    if (!response.ok) throw new Error('Failed to fetch users');
    const users = await response.json();
    const tbody = document.getElementById('usersTbody');
    tbody.innerHTML = '';

    let studentCount = 0, teacherCount = 0;

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">No users found.</td></tr>';
    } else {
      users.forEach(u => {
        const initials = u.name.split(/[\s,]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const color    = colorFromId(u.id);
        const isStudent = u.role === 'student';
        if (isStudent) studentCount++; else teacherCount++;

        const row = document.createElement('tr');
        row.dataset.search = (u.name + ' ' + u.id + ' ' + (u.course || u.subject || '') + ' ' + (u.section || '') + ' ' + u.email + ' ' + u.role).toLowerCase();

        const nameEsc    = escAttr(u.name);
        const idEsc      = escAttr(u.id);
        const courseEsc  = escAttr(u.course || u.subject || '');
        const sectionEsc = escAttr(u.section || '—');
        const emailEsc   = escAttr(u.email);
        const roleLabel  = isStudent ? 'Student' : 'Teacher';

        row.innerHTML = `
          <td><span class="link-name" onclick="openProfile('${nameEsc}','${idEsc}','${roleLabel}','${courseEsc}','${sectionEsc}','${emailEsc}')">${escHtml(u.name)}</span></td>
          <td><span class="chip ${isStudent ? 'chip-section' : 'chip-teacher'}">${roleLabel}</span></td>
          <td>${escHtml(u.course || u.subject || '')}</td>
          <td>${escHtml(u.section || '—')}</td>
          <td class="mono" style="font-size:11px">${escHtml(u.email)}</td>`;
        tbody.appendChild(row);
      });
    }

    document.getElementById('uTotal').textContent    = users.length;
    document.getElementById('uStudents').textContent = studentCount;
    document.getElementById('uTeachers').textContent = teacherCount;
  } catch (error) {
    console.error('Error loading users:', error);
    toast('Error loading users');
  }
}

// Load all data on page load
document.addEventListener('DOMContentLoaded', () => {
  loadStudents();
  loadTeachers();
  loadAllUsers();
  loadAttendanceLogs();
  loadPendingRegistrations();
  loadTodayClasses();
});

/* ──────────────────────────────────────────
   TODAY'S CLASSES
────────────────────────────────────────── */
async function loadTodayClasses() {
  const body = document.getElementById('todayClassesBody');
  if (!body) return;

  const shortDays  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const now        = new Date();
  const todayShort = shortDays[now.getDay()];

  body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">Loading…</div>';

  try {
    const [cRes, tRes] = await Promise.all([
      fetch('/api/admin/classes'),
      fetch('/api/admin/teachers')
    ]);
    if (!cRes.ok) throw new Error('Could not load classes');

    const { classes } = await cRes.json();
    const teachers    = tRes.ok ? await tRes.json() : [];

    const shortIdToName = {};
    teachers.forEach(t => { shortIdToName[t.id] = t.name; });

    const byTeacher = {};
    (classes || []).forEach(cls => {
      (cls.subjects || []).forEach(sub => {
        const daysArr = Array.isArray(sub.days)
          ? sub.days
          : (sub.days ? sub.days.split(',').map(d => d.trim()) : []);
        if (!daysArr.includes(todayShort)) return;

        const tid = cls.teacher_id;
        if (!byTeacher[tid]) {
          const shortId = tid.slice(0, 8).toUpperCase();
          byTeacher[tid] = { name: shortIdToName[shortId] || 'Unknown Teacher', items: [] };
        }
        byTeacher[tid].items.push({
          time:      sub.start_time || '??:??',
          end_time:  sub.end_time   || '',
          subject:   sub.subject    || 'Unknown Subject',
          className: cls.class_name || '',
          room:      sub.room       || 'TBA',
        });
      });
    });

    Object.values(byTeacher).forEach(t => t.items.sort((a, b) => a.time > b.time ? 1 : -1));

    const entries = Object.entries(byTeacher).filter(([, d]) => d.items.length > 0);

    if (entries.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">No classes scheduled for today.</div>';
      return;
    }

    const palette = ['var(--accent)','#e91e8c','#f59e0b','#10b981','#a855f7','#06b6d4'];
    let html = '';
    entries.forEach(([, data], idx) => {
      const key      = 'rtc' + idx;
      const color    = palette[idx % palette.length];
      const initials = data.name.split(/[\s,]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'T' + (idx + 1);
      html += `
        <div class="teacher-block">
          <div class="teacher-hdr" onclick="toggleSched('${key}')">
            <div class="avatar" style="background:${color};width:36px;height:36px;font-size:11px">${esc(initials)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text)">${esc(data.name)}</div>
              <div style="font-size:11px;color:var(--text2)">${esc(data.items[0].subject)} · ${data.items.length} class${data.items.length > 1 ? 'es' : ''}</div>
            </div>
            <span class="teacher-expand" id="ico-${key}">▾</span>
          </div>
          <div class="teacher-sched" id="sched-${key}" style="display:none">
            ${data.items.map(item => buildSchedItem(item, now)).join('')}
          </div>
        </div>`;
    });
    body.innerHTML = html;

  } catch (err) {
    console.error('[loadTodayClasses]', err);
    body.innerHTML = `<div style="padding:16px;color:var(--red);font-size:13px">Failed to load: ${err.message}</div>`;
  }
}

function buildSchedItem(item, now) {
  const cur      = now.getHours() * 60 + now.getMinutes();
  const parseMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const start    = parseMin(item.time);
  const end      = parseMin(item.end_time);

  let chip, borderColor;
  if (end !== null && cur > end) {
    chip = `<span class="chip chip-present">Done</span>`;
    borderColor = 'var(--green)';
  } else if (start !== null && cur >= start && (end === null || cur <= end)) {
    chip = `<span class="chip chip-section">Active</span>`;
    borderColor = 'var(--accent)';
  } else {
    chip = `<span class="chip" style="background:var(--surface2);color:var(--text2)">Upcoming</span>`;
    borderColor = 'var(--text3)';
  }

  return `
    <div class="sched-item" style="border-left-color:${borderColor}">
      <span class="sched-time" style="color:${borderColor}">${esc(item.time)}</span>
      <div>
        <div class="sched-class">${esc(item.subject)} — ${esc(item.className)}</div>
        <div class="sched-room">${esc(item.room)}</div>
      </div>
      ${chip}
    </div>`;
}

/* ──────────────────────────────────────────
   ATTENDANCE LOGS
────────────────────────────────────────── */
async function loadAttendanceLogs() {
  try {
    const response = await fetch('/api/admin/attendance-logs');
    if (!response.ok) throw new Error('Failed to fetch attendance logs');
    const logs = await response.json();
    const tbody = document.getElementById('logsTbody');
    tbody.innerHTML = '';

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">No records found.</td></tr>';
      return;
    }

    logs.forEach(log => {
      const statusClass = log.status === 'Present' ? 'chip-present'
                        : log.status === 'Absent'  ? 'chip-absent'
                        : 'chip-late';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="mono">${esc(log.date ? String(log.date).split('T')[0] : '—')}</td>
        <td>${esc(log.student_name)}</td>
        <td class="mono">${esc(log.time)}</td>
        <td>${esc(log.subject)}</td>
        <td>${esc(log.period)}</td>
        <td><span class="chip ${statusClass}">${esc(log.status)}</span></td>`;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading attendance logs:', error);
    toast('Error loading attendance logs');
  }
}

/* ──────────────────────────────────────────
   PROFILE MODAL
────────────────────────────────────────── */
function openProfile(name, id, role, course, section, email) {
  document.getElementById('profileTitle').textContent = name;
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.)\s*/i, '').split(/[\s,]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const color    = colorFromId(id);
  document.getElementById('profileAvatar').innerHTML =
    `<div class="avatar" style="background:${color};width:48px;height:48px;font-size:13px;flex-shrink:0">${initials}</div>` +
    `<div><div style="font-size:15px;font-weight:700;color:var(--text)">${escHtml(name)}</div>` +
    `<span class="chip ${role === 'Teacher' ? 'chip-teacher' : 'chip-section'}" style="margin-top:4px">${role}</span></div>`;
  document.getElementById('profileBody').innerHTML =
    '<table style="width:100%;border-collapse:collapse">' +
      profileRow('ID',               `<span class="mono">${escHtml(id)}</span>`) +
      profileRow('Course / Subject', escHtml(course)) +
      profileRow('Section',          escHtml(section)) +
      profileRow('Email',            `<span class="mono" style="font-size:12px">${escHtml(email)}</span>`) +
    '</table>';
  openModal('profileModal');
}

function profileRow(label, val) {
  return `<tr>
    <td style="padding:7px 0;color:var(--text3);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;width:130px">${label}</td>
    <td style="padding:7px 0;color:var(--text);font-size:13px">${val}</td>
  </tr>`;
}

/* ──────────────────────────────────────────
   ADD USER MODAL
────────────────────────────────────────── */
function openAddModal(role) {
  if (role) document.getElementById('newRole').value = role;
  onRoleChange();
  openModal('addModal');
}

function onRoleChange() {
  const role = document.getElementById('newRole').value;
  document.getElementById('newIdLabel').textContent     = role === 'student' ? 'Student ID'  : 'Employee ID';
  document.getElementById('newCourseLabel').textContent = role === 'student' ? 'Course'       : 'Subject';
  document.getElementById('studentOnlyFields').style.display = role === 'student' ? '' : 'none';
  document.getElementById('teacherOnlyFields').style.display = role === 'teacher' ? '' : 'none';
}

function submitUser() {
  const name  = document.getElementById('newName').value.trim();
  const id    = document.getElementById('newId').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  if (!name || !id || !email) { toast('Please fill in all required fields.'); return; }
  closeModal('addModal');
  ['newName','newId','newEmail','newCourse','newOffice'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });
  toast(`✓ User "${name}" created successfully!`);
}

/* ──────────────────────────────────────────
   MODAL HELPERS
────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function (e) {
    if (e.target === this) closeModal(this.id);
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
    document.getElementById('sidebar').classList.remove('open');
  }
});

/* ──────────────────────────────────────────
   LOG CONTROLS
────────────────────────────────────────── */
function applyLogFilter() {
  const stu = document.getElementById('fStudent').value.trim().toLowerCase();
  const sub = document.getElementById('fSubject').value.toLowerCase();
  const sta = document.getElementById('fStatus').value.toLowerCase();
  let shown = 0;
  document.querySelectorAll('#logsTbody tr').forEach(row => {
    const txt = row.textContent.toLowerCase();
    const ok  = (!stu || txt.includes(stu)) && (!sub || txt.includes(sub)) && (!sta || txt.includes(sta));
    row.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  document.getElementById('filterMsg').textContent = `Showing ${shown} record(s).`;
}

function exportLogs() {
  const rows = document.querySelectorAll('#logsTbody tr');
  let csv = 'Date,Student,Time,Subject,Period,Status\n';
  rows.forEach(r => {
    if (r.style.display === 'none') return;
    const cells = r.querySelectorAll('td');
    csv += [...cells].map(c => `"${c.textContent.trim()}"`).join(',') + '\n';
  });
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'attendance_logs.csv';
  a.click();
  toast('↓ CSV exported!');
}

function clearLogs() {
  if (!confirm('Clear all attendance records? This cannot be undone.')) return;
  document.getElementById('logsTbody').innerHTML =
    '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">No records.</td></tr>';
  document.getElementById('filterMsg').textContent = '';
  toast('Logs cleared.');
}

/* ──────────────────────────────────────────
   UTILITY: HTML escaping
────────────────────────────────────────── */
// Used inside innerHTML strings (escapes < > & " but not single quotes)
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Alias used in most places (same as esc)
function escHtml(str) { return esc(str); }
// Used inside HTML attribute values wrapped in single quotes — escapes '
function escAttr(str) {
  return String(str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}