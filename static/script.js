// ══════════════════════════════════════════
// AttendTrack Student Dashboard - External JS
// ══════════════════════════════════════════

// DATA — Full Semester (Jan 6 – Mar 26, 2026)
const SUBJECTS = [
  {id:'prog1',  name:'Programming 1',      color:'#6366F1', days:['Mon','Wed'], time:'8:00 – 9:00 AM',   room:'CL-201'},
  {id:'ds',     name:'Data Structures',    color:'#0EA5E9', days:['Mon','Thu'], time:'9:15 – 10:15 AM',  room:'CL-305'},
  {id:'algo',   name:'Algorithms',         color:'#10B981', days:['Tue','Thu'], time:'10:30 – 11:30 AM', room:'CL-101'},
  {id:'dbs',    name:'Database Systems',   color:'#F59E0B', days:['Tue','Fri'], time:'12:30 – 1:30 PM',  room:'CL-404'},
  {id:'cn',     name:'Computer Networks',  color:'#EF4444', days:['Wed','Fri'], time:'1:45 – 2:45 PM',   room:'CL-202'},
  {id:'se',     name:'Software Eng.',      color:'#8B5CF6', days:['Mon','Thu'], time:'3:00 – 4:00 PM',   room:'CL-301'},
];

const VIEW_META={
  dashboardView:{title:'Dashboard',sub:'Overview · Today, February 26 2026'},
  attendanceView:{title:'Attendance History',sub:'2nd Semester, A.Y. 2025–2026'},
  settingsView:{title:'Settings',sub:'Profile & Preferences'},
};

const PAGE_SIZE=20;
let currentPage=1;
let currentFilter='all', currentMonth='all', currentSubject='all';
let ALL_RECORDS=[];

const NOTIFICATIONS = [
  {
    id: 1,
    title: 'Attendance Warning',
    text: 'Your attendance in Data Structures is currently at 75%.',
    time: '10 mins ago',
    unread: true,
    color: 'var(--amber)',
    bg: 'var(--amber-pale)'
  },
  {
    id: 2,
    title: 'Grade Posted',
    text: 'Programming 1: Quiz #3 results are now available.',
    time: '2 hours ago',
    unread: true,
    color: 'var(--accent)',
    bg: 'var(--accent-bg)'
  },
  {
    id: 3,
    title: 'Schedule Update',
    text: 'Algorithms class on Friday is moved to Room CL-202.',
    time: 'Yesterday',
    unread: false,
    color: 'var(--green)',
    bg: 'var(--green-pale)'
  }
];

// Generate semester records: Jan 6 – Feb 26, 2026
function generateSemesterData() {
  const records = [];
  const start = new Date('2026-01-06');
  const end   = new Date('2026-02-26');
  const dayMap = {0:'Sun',1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat'};
  const statuses = ['present','present','present','present','present','present','absent','late','excused'];

  let seed = 42;
  function rand() { seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }

  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const dow = dayMap[d.getDay()];
    SUBJECTS.forEach(subj => {
      if (!subj.days.includes(dow)) return;
      const iso = d.toISOString().split('T')[0];
      const r = rand();
      let status;
      if (r < 0.70) status = 'present';
      else if (r < 0.82) status = 'late';
      else if (r < 0.93) status = 'absent';
      else status = 'excused';
      records.push({date: iso, dow, subjId: subj.id, subjName: subj.name, time: subj.time, room: subj.room, status});
    });
  }
  return records;
}

function getCounts(records) {
  return records.reduce((a,r) => {
    a[r.status] = (a[r.status]||0)+1;
    a.total++;
    return a;
  },{present:0,absent:0,late:0,excused:0,total:0});
}

let TEACHER_CLASSES = [];
let selectedTeacherClass = null;

function updateSelectedClassCard() {
  const card = document.getElementById('selectedClassInfo');
  if (!card) return;
  if (!selectedTeacherClass) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  document.getElementById('selectedClassName').textContent = selectedTeacherClass.class_name || 'Unnamed class';
  const meta = `${selectedTeacherClass.subject || 'No subject'} · ${selectedTeacherClass.section || 'No section'} · ${selectedTeacherClass.schedule || 'No schedule'}`;
  document.getElementById('selectedClassMeta').textContent = meta;
}

function renderTeacherClasses() {
  const list = document.getElementById('classList');
  const tableBody = document.getElementById('tableBody');
  const noDataText = document.getElementById('noDataText');
  if (!list || !tableBody || !noDataText) return;

  if (TEACHER_CLASSES.length === 0) {
    list.innerHTML = '<div class="class-item" style="cursor:default">No classes yet. Create one to begin.</div>';
    tableBody.innerHTML = '';
    noDataText.style.display = 'block';
    selectedTeacherClass = null;
    updateSelectedClassCard();
    renderClassDropdownMini();
    return;
  }

  list.innerHTML = TEACHER_CLASSES.map(cls => `
    <div class="class-item${selectedTeacherClass && selectedTeacherClass.id === cls.id ? ' active' : ''}" onclick="selectTeacherClass('${cls.id}')">
      <div style="font-weight:700">${cls.class_name || 'Untitled'}</div>
      <div style="font-size:12px;color:var(--ink4);margin-top:4px">${cls.subject || 'No subject'}</div>
    </div>
  `).join('');

  tableBody.innerHTML = TEACHER_CLASSES.map(cls => `
    <tr>
      <td>${cls.class_name || '—'}</td>
      <td>${cls.subject || '—'}</td>
      <td>${cls.section || '—'}</td>
      <td>${cls.schedule || '—'}</td>
      <td>${cls.password || '—'}</td>
    </tr>
  `).join('');

  noDataText.style.display = 'none';
  if (!selectedTeacherClass) {
    selectedTeacherClass = TEACHER_CLASSES[0];
  }
  updateSelectedClassCard();
  renderClassDropdownMini();
}

function renderClassDropdownMini() {
  const classListMini = document.getElementById('classListMini');
  if (!classListMini) return;

  if (TEACHER_CLASSES.length === 0) {
    classListMini.innerHTML = '<div class="mini-dropdown-class" style="cursor:default">No classes yet</div>';
    return;
  }

  classListMini.innerHTML = TEACHER_CLASSES.map(cls => {
    const subjectCount = Array.isArray(cls.subjects) ? cls.subjects.length : 0;
    return `<div class="mini-dropdown-class${selectedTeacherClass && selectedTeacherClass.id===cls.id ? ' active' : ''}" onclick="selectTeacherClass('${cls.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span>${cls.class_name || 'Untitled'}</span>
        <small style="color:rgba(255,255,255,0.65);font-size:11px">${subjectCount} subj</small>
      </div>
    </div>`;
  }).join('');
}

function selectTeacherClass(classId) {
  selectedTeacherClass = TEACHER_CLASSES.find(cls => cls.id === classId) || null;
  renderTeacherClasses();
}

function openClassModal() {
  const modal = document.getElementById('classModal');
  if (!modal) return;
  modal.style.display = 'flex';
}

function hideClassModal() {
  const modal = document.getElementById('classModal');
  if (!modal) return;
  modal.style.display = 'none';
}

function openSubjectModal() {
  if (!selectedTeacherClass) {
    alert('Select a class first or create one.');
    return;
  }
  const modal = document.getElementById('subjectModal');
  if (!modal) return;
  modal.style.display = 'flex';
}

function hideSubjectModal() {
  const modal = document.getElementById('subjectModal');
  if (!modal) return;
  modal.style.display = 'none';
}

function submitSubjectForm() {
  const name = document.getElementById('subjectNameInput')?.value.trim();
  const code = document.getElementById('subjectCodeInput')?.value.trim();
  const description = document.getElementById('subjectDescInput')?.value.trim();

  if (!selectedTeacherClass) {
    alert('Select a class first before adding a subject.');
    return;
  }
  if (!name || !code) {
    alert('Please enter both subject name and code.');
    return;
  }

  const subject = {
    id: `${code.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`,
    name,
    code,
    description
  };

  selectedTeacherClass.subjects = Array.isArray(selectedTeacherClass.subjects) ? selectedTeacherClass.subjects : [];
  selectedTeacherClass.subjects.push(subject);
  const idx = TEACHER_CLASSES.findIndex(cls => cls.id === selectedTeacherClass.id);
  if (idx !== -1) TEACHER_CLASSES[idx] = selectedTeacherClass;

  renderClassDropdownMini();
  hideSubjectModal();

  document.getElementById('subjectNameInput').value = '';
  document.getElementById('subjectCodeInput').value = '';
  document.getElementById('subjectDescInput').value = '';

  alert('Subject added to the selected class.');
}

function openQR() {
  if (!selectedTeacherClass) {
    alert('Select a class first or create one.');
    return;
  }
  const qrModal = document.getElementById('qrModal');
  const qrImage = document.getElementById('qrImage');
  const qrText = document.getElementById('qrText');
  if (!qrModal || !qrImage || !qrText) return;
  const qrValue = selectedTeacherClass.qr_data || `${selectedTeacherClass.class_name} | ${selectedTeacherClass.subject} | ${selectedTeacherClass.section}`;
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrValue)}`;
  qrText.textContent = qrValue;
  qrModal.style.display = 'flex';
}

function hideQRModal() {
  const qrModal = document.getElementById('qrModal');
  if (!qrModal) return;
  qrModal.style.display = 'none';
}

function openPassword() {
  if (!selectedTeacherClass) {
    alert('Select a class first or create one.');
    return;
  }
  const passwordModal = document.getElementById('passwordModal');
  const passwordInput = document.getElementById('passwordUpdateInput');
  if (!passwordModal || !passwordInput) return;
  passwordInput.value = selectedTeacherClass.password || '';
  passwordModal.style.display = 'flex';
}

function hidePasswordModal() {
  const passwordModal = document.getElementById('passwordModal');
  if (!passwordModal) return;
  passwordModal.style.display = 'none';
}

function submitPasswordUpdate() {
  const passwordInput = document.getElementById('passwordUpdateInput');
  if (!selectedTeacherClass || !passwordInput) return;
  const password = passwordInput.value.trim();
  fetch(`/api/update-class/${selectedTeacherClass.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
    .then(res => res.json())
    .then(result => {
      if (result.error) throw new Error(result.error);
      selectedTeacherClass.password = password;
      const index = TEACHER_CLASSES.findIndex(cls => cls.id === selectedTeacherClass.id);
      if (index !== -1) TEACHER_CLASSES[index].password = password;
      renderTeacherClasses();
      hidePasswordModal();
      alert('Class password updated.');
    })
    .catch(err => alert(`Error updating password: ${err.message}`));
}

function submitClassForm() {
  const name = document.getElementById('classNameInput')?.value.trim();
  const subject = document.getElementById('classSubjectInput')?.value.trim();
  const section = document.getElementById('classSectionInput')?.value.trim();
  const schedule = document.getElementById('classScheduleInput')?.value.trim();
  const password = document.getElementById('classPasswordInput')?.value.trim();
  const qrData = document.getElementById('classQRInput')?.value.trim();

  if (!name || !subject || !section || !schedule) {
    alert('Please complete the class name, subject, section, and schedule.');
    return;
  }

  const payload = {
    class_name: name,
    subject,
    section,
    schedule,
    password,
    qr_data: qrData || `${name} | ${subject} | ${section}`
  };

  fetch('/api/add-class', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(result => {
      if (result.error) throw new Error(result.error);
      hideClassModal();
      document.getElementById('classNameInput').value = '';
      document.getElementById('classSubjectInput').value = '';
      document.getElementById('classSectionInput').value = '';
      document.getElementById('classScheduleInput').value = '';
      document.getElementById('classPasswordInput').value = '';
      document.getElementById('classQRInput').value = '';
      fetchTeacherClasses();
    })
    .catch(err => alert(`Error saving class: ${err.message}`));
}

function fetchTeacherClasses() {
  fetch('/api/get-classes')
    .then(res => res.json())
    .then(result => {
      if (result.error) throw new Error(result.error);
      TEACHER_CLASSES = Array.isArray(result) ? result : [];
      selectedTeacherClass = TEACHER_CLASSES[0] || null;
      renderTeacherClasses();
    })
    .catch(err => {
      const list = document.getElementById('classList');
      if (list) list.innerHTML = '<div class="class-item" style="cursor:default">Unable to load classes.</div>';
      console.error('Fetch classes error:', err);
    });
}

function generateRandomPassword(length = 8) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
}

// LIVE CLOCK
function updateClock(){
  const n=new Date(),h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();
  const ap=h>=12?'PM':'AM',hh=h%12||12;
  document.getElementById('liveTime').textContent=`${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ap}`;
}

// DASHBOARD STATS
function animCount(el,target,dur=700){
  if(!el)return;
  const st=performance.now();
  (function step(now){
    const p=Math.min((now-st)/dur,1);
    const e=1-Math.pow(1-p,3);
    el.textContent=Math.round(e*target);
    if(p<1)requestAnimationFrame(step);
    else el.textContent=target;
  })(performance.now());
}

function renderDashboard(){
  const c=getCounts(ALL_RECORDS);
  const rate=c.total?Math.round((c.present/c.total)*100):0;

  animCount(document.getElementById('dashPresent'),c.present);
  animCount(document.getElementById('dashAbsent'),c.absent);
  animCount(document.getElementById('dashLate'),c.late);

  document.getElementById('dashRate').textContent=rate+'%';
  document.getElementById('dashRateTrend').textContent=rate+'%';
  document.getElementById('sidebarRate').textContent=rate+'%';

  document.getElementById('absentTrend').textContent=c.absent<=5?'✓ OK':'! High';

  setTimeout(()=>{
    const circum=113.1;
    const offset=circum-(rate/100)*circum;
    document.getElementById('rateRingFill').style.strokeDashoffset=offset;
  },300);

  document.getElementById('sidebarAbsentBadge').textContent=c.absent;
}

// ATTENDANCE TABLE
const BADGE_MAP={
  present:`<span class="badge badge-present"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>Present</span>`,
  absent:`<span class="badge badge-absent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>Absent</span>`,
  late:`<span class="badge badge-late"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg>Late</span>`,
  excused:`<span class="badge badge-excused"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>Excused</span>`,
};

function getFilteredRecords(){
  return ALL_RECORDS.filter(r=>{
    if(currentFilter!=='all'&&r.status!==currentFilter)return false;
    if(currentMonth!=='all'&&!r.date.startsWith('2026-'+currentMonth))return false;
    if(currentSubject!=='all'&&r.subjId!==currentSubject)return false;
    return true;
  });
}

function renderTable(){
  const filtered=getFilteredRecords();
  const total=filtered.length;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  currentPage=Math.min(currentPage,totalPages);

  const pageRecs=filtered.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

  let html='<table class="att-table"><thead><tr><th>Date</th><th>Day</th><th>Subject</th><th>Time</th><th>Room</th><th>Status</th></tr></thead><tbody>';

  if(pageRecs.length===0){
    html+='<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--ink5)">No records found for the selected filter.</td></tr>';
  } else {
    pageRecs.forEach(r=>{
      const subj=SUBJECTS.find(s=>s.id===r.subjId);
      html+=`<tr>
        <td><span class="mono">${r.date}</span></td>
        <td><span class="mono" style="color:var(--ink4)">${r.dow}</span></td>
        <td><div class="subject-cell"><div class="subject-dot" style="background:${subj?.color||'#888'}"></div>${r.subjName}</div></td>
        <td><span class="mono">${r.time}</span></td>
        <td><span class="mono">${r.room}</span></td>
        <td>${BADGE_MAP[r.status]||r.status}</td>
      </tr>`;
    });
  }
  html+='</tbody></table>';
  document.getElementById('historyTableWrap').innerHTML=html;

  // Pagination
  const from=(currentPage-1)*PAGE_SIZE+1;
  const to=Math.min(currentPage*PAGE_SIZE,total);
  let paginHTML=`<div class="page-info">Showing <strong>${total>0?from:0}–${to}</strong> of <strong>${total}</strong> records</div><div class="page-btns">`;
  paginHTML+=`<button class="page-btn" id="pgPrev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>`;
  const maxBtns=5;
  let startP=Math.max(1,currentPage-2),endP=Math.min(totalPages,startP+maxBtns-1);
  if(endP-startP<maxBtns-1)startP=Math.max(1,endP-maxBtns+1);
  for(let p=startP;p<=endP;p++){
    paginHTML+=`<button class="page-btn${p===currentPage?' active':''}" data-page="${p}">${p}</button>`;
  }
  paginHTML+=`<button class="page-btn" id="pgNext"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  paginHTML+='</div>';
  document.getElementById('pagination').innerHTML=paginHTML;

  document.getElementById('pgPrev').onclick=()=>{if(currentPage>1){currentPage--;renderTable();}};
  document.getElementById('pgNext').onclick=()=>{if(currentPage<totalPages){currentPage++;renderTable();}};
  document.querySelectorAll('[data-page]').forEach(b=>{
    b.onclick=()=>{currentPage=parseInt(b.dataset.page);renderTable();};
  });
}

function renderSummaryChips(){
  const c=getCounts(ALL_RECORDS);
  const rate=c.total?Math.round((c.present/c.total)*100):0;
  document.getElementById('summaryChips').innerHTML=`
    <div class="chip"><div class="chip-dot" style="background:var(--green)"></div>Present<span class="chip-count" style="color:var(--green)">${c.present}</span></div>
    <div class="chip"><div class="chip-dot" style="background:var(--red)"></div>Absent<span class="chip-count" style="color:var(--red)">${c.absent}</span></div>
    <div class="chip"><div class="chip-dot" style="background:var(--amber)"></div>Late<span class="chip-count" style="color:var(--amber)">${c.late}</span></div>
    <div class="chip"><div class="chip-dot" style="background:var(--purple)"></div>Excused<span class="chip-count" style="color:var(--purple)">${c.excused}</span></div>
    <div class="chip"><div class="chip-dot" style="background:var(--accent)"></div>Overall Rate<span class="chip-count" style="color:var(--accent)">${rate}%</span></div>
    <div class="chip" style="margin-left:auto"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span style="color:var(--ink5);font-size:12px">Jan 6 – Feb 26, 2026</span></div>
  `;
}

function renderSubjectLegend(){
  const wrap=document.getElementById('subjectLegend');
  wrap.innerHTML=`<div class="legend-item active" data-subj="all"><div class="legend-dot" style="background:var(--ink4)"></div>All Subjects</div>`+
    SUBJECTS.map(s=>`<div class="legend-item" data-subj="${s.id}"><div class="legend-dot" style="background:${s.color}"></div>${s.name}</div>`).join('');
  wrap.querySelectorAll('.legend-item').forEach(el=>{
    el.onclick=()=>{
      currentSubject=el.dataset.subj;
      currentPage=1;
      wrap.querySelectorAll('.legend-item').forEach(x=>x.classList.remove('active'));
      el.classList.add('active');
      renderTable();
    };
  });
}

function renderNotifications() {
  const container = document.querySelector('#notifDropdown .card-body');
  if (!container) return;
  
  container.innerHTML = NOTIFICATIONS.map(n => `
    <div class="notif-item ${n.unread ? 'unread' : ''}">
      <div class="notif-icon" style="background: ${n.bg}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${n.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
      </div>
      <div style="flex:1">
        <div class="notif-title">${n.title}</div>
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>
  `).join('');
}

// EVENT HANDLERS
document.addEventListener('click',e=>{
  const fb=e.target.closest('[data-filter]');
  if(fb){
    currentFilter=fb.dataset.filter;
    currentPage=1;
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===fb));
    renderTable();
    return;
  }
  const mb=e.target.closest('[data-month]');
  if(mb){
    currentMonth=mb.dataset.month;
    currentPage=1;
    document.querySelectorAll('[data-month]').forEach(b=>b.classList.toggle('active',b===mb));
    renderTable();
    return;
  }
});

// Export CSV
document.addEventListener('click',e=>{
  if(e.target.id==='exportBtn'){
    // Show loading
    const btn = e.target;
    const originalText = btn.textContent;
    btn.textContent = 'Exporting...';
    btn.disabled = true;
    
    // Small delay to show loading state
    setTimeout(() => {
      const rows=getFilteredRecords();
      const csv=['Date,Day,Subject,Time,Room,Status',...rows.map(r=>`"${r.date}","${r.dow}","${r.subjName}","${r.time}","${r.room}","${r.status}"`)].join('\n');
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
      a.download='attendance_semester.csv';
      a.click();
      
      // Reset button
      btn.textContent = originalText;
      btn.disabled = false;
    }, 500);
  }
});

function saveProfile(e) {
  if (e) e.preventDefault();
  
  const saveBtn = document.getElementById('saveProfileBtn');
  const originalText = saveBtn.textContent;
  
  // Show loading state
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;margin-right:8px;animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Saving...';
  
  // Simulate processing time
  setTimeout(() => {
    const profile = {
      firstName: document.getElementById('setFirstName')?.value || '',
      middleName: document.getElementById('setMiddleName')?.value || '',
      lastName: document.getElementById('setLastName')?.value || '',
      studentId: document.getElementById('setStudentId')?.value || '',
      program: document.getElementById('setProgram')?.value || '',
      section: document.getElementById('setSection')?.value || ''
    };
    localStorage.setItem('attendtrack_profile', JSON.stringify(profile));
    updateUIWithProfile(profile);
    
    // Reset button
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
    
    // Show success message
    alert('Profile updated successfully!');
  }, 800);
}

function updateUIWithProfile(profile) {
  const fullName = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ');
  const initials = (profile.firstName[0] || '') + (profile.lastName[0] || '');

  // Update Sidebar (Desktop & Mobile)
  document.querySelectorAll('.student-name, .m-name').forEach(el => el.textContent = fullName);
  document.querySelectorAll('.student-avatar, .m-avatar').forEach(el => el.textContent = initials.toUpperCase());
  const metaText = `${profile.program} · Section ${profile.section}`;
  document.querySelectorAll('.student-meta, .m-meta').forEach(el => el.textContent = metaText);

  // Update Dashboard Greeting
  const welcomeH2 = document.querySelector('#dashboardView h2');
  if (welcomeH2) welcomeH2.textContent = `Good morning, ${profile.firstName} 👋`;
}

function logout() {
  if (!window.confirm('Are you sure you want to log out?')) return;
  localStorage.removeItem('attendtrack_profile');
  sessionStorage.clear();
  window.location.href = '/logout';
}

// VIEW SWITCHING
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('[data-target]').forEach(a=>a.classList.toggle('active',a.dataset.target===id));
  document.getElementById('pageTitle').textContent=VIEW_META[id]?.title||'';
  document.getElementById('pageSub').textContent=VIEW_META[id]?.sub||'';
  if(id==='dashboardView') renderDashboard();
  if(id==='attendanceView'){renderSummaryChips();renderSubjectLegend();renderTable();}
}

// HAMBURGER
function closeMini(){document.getElementById('miniSidebar').classList.remove('show');document.getElementById('overlay').classList.remove('show');}
document.addEventListener('click',e=>{
  if(e.target.id==='hamburger'||e.target.closest('#miniSidebar')){
    document.getElementById('miniSidebar').classList.toggle('show');
    document.getElementById('overlay').classList.toggle('show');
    return;
  }
  if(e.target.id==='overlay') closeMini();
});

// INIT
document.addEventListener('DOMContentLoaded',()=>{
  ALL_RECORDS=generateSemesterData();
  updateClock();
  setInterval(updateClock,1000);
  renderNotifications();

  // Load existing profile from storage
  const savedProfile = localStorage.getItem('attendtrack_profile');
  if (savedProfile) {
    const profile = JSON.parse(savedProfile);
    updateUIWithProfile(profile);
    // Populate input fields with saved data
    if (profile.firstName) document.getElementById('setFirstName').value = profile.firstName;
    if (profile.middleName) document.getElementById('setMiddleName').value = profile.middleName;
    if (profile.lastName) document.getElementById('setLastName').value = profile.lastName;
    if (profile.program) document.getElementById('setProgram').value = profile.program;
    if (profile.section) document.getElementById('setSection').value = profile.section;
  }

  // Header Connectivity
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) profileBtn.onclick = () => showView('settingsView');

  const notifBtn = document.getElementById('notifBtn');
  const notifDropdown = document.getElementById('notifDropdown');
  if (notifBtn && notifDropdown) {
    notifBtn.onclick = (e) => {
      e.stopPropagation();
      const isShowing = notifDropdown.style.display === 'block';
      notifDropdown.style.display = isShowing ? 'none' : 'block';
      if (!isShowing) {
        const dot = notifBtn.querySelector('.notif-dot');
        if (dot) dot.style.display = 'none';
      }
    };
    notifDropdown.onclick = (e) => e.stopPropagation();
  }

  // Hide dropdown when clicking elsewhere
  window.addEventListener('click', () => {
    if (notifDropdown) notifDropdown.style.display = 'none';
  });

  // Settings Buttons Connectivity
  const saveBtn = document.getElementById('saveProfileBtn');
  if (saveBtn) saveBtn.onclick = saveProfile;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;

  if (document.getElementById('classList')) {
    fetchTeacherClasses();
  }

  const dropdownToggle = document.getElementById('classDropdownToggle');
  const miniDropdown = document.querySelector('.mini-nav-dropdown');
  if (dropdownToggle && miniDropdown) {
    dropdownToggle.onclick = e => {
      e.stopPropagation();
      miniDropdown.classList.toggle('open');
    };
    window.addEventListener('click', e => {
      if (!e.target.closest('.mini-nav-dropdown')) {
        miniDropdown.classList.remove('open');
      }
    });
  }

  document.querySelectorAll('[data-target]').forEach(a=>{
    a.onclick=e=>{e.preventDefault();showView(a.dataset.target);closeMini();}
  });
  showView('dashboardView');
});
