
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
  
  // Reload data when switching to students, teachers, or users views
  if (id === 'students') loadStudents();
  if (id === 'teachers') loadTeachers();
  if (id === 'users') loadAllUsers();
  if (id === 'logs') loadAttendanceLogs();
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
let pendingCount = 5;

function updatePendingBadges() {
  const txt = pendingCount > 0 ? pendingCount + ' pending' : 'None';
  document.getElementById('pendingChip').textContent = txt;
  document.getElementById('sbPendingBadge').textContent = pendingCount;
  document.getElementById('dPending').textContent = pendingCount;
  if (pendingCount === 0) document.getElementById('sbPendingBadge').style.display = 'none';
}
async function loadPendingRegistrations() {
  try {
    const response = await fetch('/api/admin/registrations');
    if (!response.ok) throw new Error('Failed to fetch registrations');
    const registrations = await response.json();
    const regList = document.getElementById('regList');
    regList.innerHTML = '';
    
    pendingCount = registrations.length;
    updatePendingBadges();
    
    registrations.forEach(reg => {
      const colors = ['var(--accent)', '#e91e8c', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];
      const color = colors[Math.abs(reg.id % colors.length)];
      const initials = reg.fullname.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const type = reg.role === 'student' ? 'Student' : 'Teacher';
      const details = reg.role === 'student' 
        ? `${reg.course || ''} · ${reg.section || ''}`
        : reg.course || '';
      
      const item = document.createElement('div');
      item.className = 'reg-item';
      item.dataset.id = reg.id;
      item.dataset.type = reg.role;
      item.innerHTML = `
        <div class="avatar" style="background:${color};width:36px;height:36px;font-size:11px">${initials}</div>
        <div class="reg-info">
          <div class="reg-name">${reg.fullname}</div>
          <div class="reg-sub">${type} · Applied ${new Date(reg.created_at).toLocaleDateString()} · ${details} · ${reg.email}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-xs btn-success" onclick="handleReg(this,'accept')">Accept</button>
          <button class="btn btn-xs btn-danger"  onclick="handleReg(this,'decline')">Decline</button>
        </div>
      `;
      regList.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading registrations:', error);
    toast('Error loading registrations');
  }
}
async function handleReg(btn, action) {
  const item = btn.closest('.reg-item');
  const registrationId = item.dataset.id;
  
  try {
    const endpoint = action === 'accept' 
      ? `/api/admin/accept-registration/${registrationId}`
      : `/api/admin/decline-registration/${registrationId}`;
    
    const response = await fetch(endpoint, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to process registration');
    
    item.style.transition = 'opacity .25s';
    item.style.opacity = '0';
    item.style.pointerEvents = 'none';
    setTimeout(() => { item.remove(); pendingCount--; updatePendingBadges(); }, 260);
    toast(action === 'accept' ? '✓ Registration accepted!' : '✕ Registration declined.');
  } catch (error) {
    console.error('Error:', error);
    toast('Error processing registration');
  }
}

function bulkApprove() {
  const items = document.querySelectorAll('#regList .reg-item:not([style*="display: none"])');
  items.forEach(i => {
    const btn = i.querySelector('.btn-success');
    if (btn) btn.click();
  });
  toast('✓ Processing all visible registrations...');
}

function bulkDecline() {
  const items = document.querySelectorAll('#regList .reg-item:not([style*="display: none"])');
  items.forEach(i => {
    const btn = i.querySelector('.btn-danger');
    if (btn) btn.click();
  });
  toast('✕ Processing all visible registrations...');
}

function filterReg(type) {
  document.querySelectorAll('#regList .reg-item').forEach(i => {
    i.style.display = (type === 'all' || i.dataset.type === type) ? '' : 'none';
  });
  ['rbAll','rbStu','rbTea'].forEach(id => {
    const b = document.getElementById(id);
    b.style.background = '';
    b.style.color = '';
    b.style.borderColor = '';
  });
  const map = { all: 'rbAll', student: 'rbStu', teacher: 'rbTea' };
  const ab = document.getElementById(map[type]);
  if (ab) {
    ab.style.background   = 'var(--accent)';
    ab.style.color        = '#fff';
    ab.style.borderColor  = 'var(--accent)';
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
    students.forEach(s => {
      const initials = s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const colors = ['var(--accent)', '#e91e8c', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];
      const color = colors[Math.abs(s.id.charCodeAt(0)) % colors.length];
      const row = document.createElement('tr');
      row.dataset.search = (s.name + ' ' + s.id + ' ' + (s.course || '') + ' ' + (s.section || '')).toLowerCase();
      row.innerHTML = `
        <td><div class="name-cell"><div class="avatar" style="background:${color};width:30px;height:30px;font-size:10px">${initials}</div>${s.name}</div></td>
        <td class="mono">${s.id}</td>
        <td>${s.course || ''}</td>
        <td><span class="chip chip-section">${s.section || 'N/A'}</span></td>
        <td><button class="btn btn-xs btn-danger" onclick="removeRow(this,'student')">Remove</button></td>
      `;
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
    teachers.forEach(t => {
      const initials = t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const colors = ['var(--accent)', '#e91e8c', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];
      const color = colors[Math.abs(t.id.charCodeAt(0)) % colors.length];
      const row = document.createElement('tr');
      row.dataset.search = (t.name + ' ' + t.id + ' ' + (t.subject || '')).toLowerCase();
      row.innerHTML = `
        <td><div class="name-cell"><div class="avatar" style="background:${color};width:30px;height:30px;font-size:10px">${initials}</div>${t.name}</div></td>
        <td class="mono">${t.id}</td>
        <td>${t.subject || ''}</td>
        <td><button class="btn btn-xs btn-danger" onclick="removeRow(this,'teacher')">Remove</button></td>
      `;
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
    
    users.forEach(u => {
      const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const colors = ['var(--accent)', '#e91e8c', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];
      const color = colors[Math.abs(u.id.charCodeAt(0)) % colors.length];
      
      const isStudent = u.role === 'student';
      if (isStudent) studentCount++; else teacherCount++;
      
      const row = document.createElement('tr');
      row.dataset.search = (u.name + ' ' + u.id + ' ' + (u.course || u.subject || '') + ' ' + (u.section || '') + ' ' + u.email + ' ' + u.role).toLowerCase();
      
      const nameEsc = (u.name || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const idEsc = (u.id || '').replace(/"/g, '&quot;');
      const courseEsc = (u.course || u.subject || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const sectionEsc = (u.section || '—').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const emailEsc = (u.email || '').replace(/"/g, '&quot;');
      const roleEsc = isStudent ? 'Student' : 'Teacher';
      
      row.innerHTML = `
        <td><span class="link-name" onclick="openProfile('${nameEsc}','${idEsc}','${roleEsc}','${courseEsc}','${sectionEsc}','${emailEsc}')">${u.name}</span></td>
        <td><span class="chip ${isStudent ? 'chip-section' : 'chip-teacher'}">${isStudent ? 'Student' : 'Teacher'}</span></td>
        <td>${u.course || u.subject || ''}</td>
        <td>${u.section || '—'}</td>
        <td class="mono" style="font-size:11px">${u.email}</td>
      `;
      tbody.appendChild(row);
    });
    
    document.getElementById('uTotal').textContent = users.length;
    document.getElementById('uStudents').textContent = studentCount;
    document.getElementById('uTeachers').textContent = teacherCount;
  } catch (error) {
    console.error('Error loading users:', error);
    toast('Error loading users');
  }
}

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
  loadStudents();
  loadTeachers();
  loadAllUsers();
  loadAttendanceLogs();
  loadPendingRegistrations();
});

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
    logs.forEach(log => {
      const row = document.createElement('tr');
      const statusClass = log.status === 'Present' ? 'chip-present' : log.status === 'Absent' ? 'chip-absent' : 'chip-late';
      row.innerHTML = `
        <td class="mono">${new Date(log.date).toISOString().split('T')[0]}</td>
        <td>${log.student_name}</td>
        <td class="mono">${log.time}</td>
        <td>${log.subject}</td>
        <td>${log.period || '—'}</td>
        <td><span class="chip ${statusClass}">${log.status}</span></td>
      `;
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
const avatarColors = {
  'John Doe':'var(--accent)', 'Jane Smith':'#e91e8c', 'Bob Johnson':'#10b981',
  'Alice Brown':'#f59e0b', 'Charlie Wilson':'#a855f7', 'Diana Lee':'#06b6d4',
  'Mr. James Reyes':'var(--accent)', 'Ms. Anna Cruz':'#e91e8c'
};

function openProfile(name, id, role, course, section, email) {
  document.getElementById('profileTitle').textContent = name;
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.)\s*/i,'').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const color    = avatarColors[name] || 'var(--accent)';
  document.getElementById('profileAvatar').innerHTML =
    '<div class="avatar" style="background:' + color + ';width:48px;height:48px;font-size:13px;flex-shrink:0">' + initials + '</div>' +
    '<div><div style="font-size:15px;font-weight:700;color:var(--text)">' + name + '</div>' +
    '<span class="chip ' + (role === 'Teacher' ? 'chip-teacher' : 'chip-section') + '" style="margin-top:4px">' + role + '</span></div>';
  document.getElementById('profileBody').innerHTML =
    '<table style="width:100%;border-collapse:collapse">' +
      row('ID', '<span class="mono">' + id + '</span>') +
      row('Course / Subject', course) +
      row('Section', section) +
      row('Email', '<span class="mono" style="font-size:12px">' + email + '</span>') +
    '</table>';
  openModal('profileModal');
}

function row(label, val) {
  return '<tr>' +
    '<td style="padding:7px 0;color:var(--text3);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;width:130px">' + label + '</td>' +
    '<td style="padding:7px 0;color:var(--text);font-size:13px">' + val + '</td>' +
    '</tr>';
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
  document.getElementById('newIdLabel').textContent    = role === 'student' ? 'Student ID'    : 'Employee ID';
  document.getElementById('newCourseLabel').textContent= role === 'student' ? 'Course'         : 'Subject';
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
  toast('✓ User "' + name + '" created successfully!');
}

/* ──────────────────────────────────────────
   MODAL HELPERS
────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
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
   LOGS
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
  document.getElementById('filterMsg').textContent = 'Showing ' + shown + ' record(s).';
}

function exportLogs() {
  const rows = document.querySelectorAll('#logsTbody tr');
  let csv = 'Date,Student,Time,Subject,Period,Status\n';
  rows.forEach(r => {
    if (r.style.display === 'none') return;
    const cells = r.querySelectorAll('td');
    csv += [...cells].map(c => '"' + c.textContent.trim() + '"').join(',') + '\n';
  });
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'attendance_logs.csv';
  a.click();
  toast('↓ CSV exported!');
}

function clearLogs() {
  if (!confirm('Clear all attendance records? This cannot be undone.')) return;
  document.getElementById('logsTbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">No records.</td></tr>';
  document.getElementById('filterMsg').textContent = '';
  toast('Logs cleared.');
}