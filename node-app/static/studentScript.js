// ══════════════════════════════════════════
// AttendTrack Student Dashboard - External JS
// ══════════════════════════════════════════

// DATA — Full Semester (Jan 6 – Mar 26, 2026)
const SUBJECTS = [
  {id:'prog1',  name:'Programming 1',      color:'#6366F1', days:['Mon','Wed'], time:'8:00 – 9:00 AM',   room:'CL-201', teacher:'Mr. Ramon Dela Cruz'},
  {id:'ds',     name:'Data Structures',    color:'#0EA5E9', days:['Mon','Thu'], time:'9:15 – 10:15 AM',  room:'CL-305', teacher:'Dr. Maria Santos'},
  {id:'algo',   name:'Algorithms',         color:'#10B981', days:['Tue','Thu'], time:'10:30 – 11:30 AM', room:'CL-101', teacher:'Prof. Jose Reyes'},
  {id:'dbs',    name:'Database Systems',   color:'#F59E0B', days:['Tue','Fri'], time:'12:30 – 1:30 PM',  room:'CL-404', teacher:'Dr. Ana Lim'},
  {id:'cn',     name:'Computer Networks',  color:'#EF4444', days:['Wed','Fri'], time:'1:45 – 2:45 PM',   room:'CL-202', teacher:'Engr. Carlo Bautista'},
  {id:'se',     name:'Software Eng.',      color:'#8B5CF6', days:['Mon','Thu'], time:'3:00 – 4:00 PM',   room:'CL-301', teacher:'Prof. Grace Tan'},
];

const TODAY = new Date();
const TODAY_LABEL = TODAY.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
const SEMESTER_AY = `2nd Semester, A.Y. ${TODAY.getFullYear()-1}–${TODAY.getFullYear()}`;

const VIEW_META={
  dashboardView:{title:'Dashboard',sub:`Overview · Today, ${TODAY_LABEL}`},
  attendanceView:{title:'Attendance History',sub:SEMESTER_AY},
  scheduleView:{title:'Weekly Schedule',sub:''},
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

// Generate semester records: Jan 6 – today
function generateSemesterData() {
  const records = [];
  const start = new Date('2026-01-06');
  const end   = new Date(TODAY); end.setHours(0,0,0,0);
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

// LIVE CLOCK
function updateClock(){
  const n=new Date(),h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();
  const ap=h>=12?'PM':'AM',hh=h%12||12;
  document.getElementById('liveTime').textContent=`${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ap}`;
}

// DYNAMIC GREETING
function updateGreeting() {
  const h = new Date().getHours();
  let salutation;
  if (h >= 5 && h < 12)       salutation = 'Good morning';
  else if (h >= 12 && h < 18) salutation = 'Good afternoon';
  else if (h >= 18 && h < 22) salutation = 'Good evening';
  else                         salutation = 'Good night';
  const el = document.getElementById('dashGreeting');
  if (el) el.textContent = `${salutation}, Wency 👋`;
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
  updateGreeting();

  // Dynamic date labels
  const semSub = `Here's your attendance overview — ${SEMESTER_AY}`;
  const semEl = document.getElementById('dashSemesterSub');
  if (semEl) semEl.textContent = semSub;

  const attendEl = document.getElementById('attendSemesterSub');
  if (attendEl) attendEl.textContent = `Complete log for ${SEMESTER_AY} · Jan 6 – ${TODAY_LABEL}`;

  const todaySchedEl = document.getElementById('todayScheduleDate');
  if (todaySchedEl) todaySchedEl.textContent = `${TODAY_LABEL} · 6 subjects`;

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
    if(currentMonth!=='all'&&!r.date.startsWith(TODAY.getFullYear()+'-'+currentMonth))return false;
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
    <div class="chip" style="margin-left:auto"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span style="color:var(--ink5);font-size:12px">Jan 6 – ${TODAY_LABEL}</span></div>
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
    const rows=getFilteredRecords();
    const csv=['Date,Day,Subject,Time,Room,Status',...rows.map(r=>`"${r.date}","${r.dow}","${r.subjName}","${r.time}","${r.room}","${r.status}"`)].join('\\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='attendance_semester.csv';
    a.click();
  }
});

function saveProfile(e) {
  if (e) e.preventDefault();
  const profile = {
    firstName: document.getElementById('setFirstName')?.value || '',
    middleName: document.getElementById('setMiddleName')?.value || '',
    lastName: document.getElementById('setLastName')?.value || '',
    studentId: document.getElementById('setStudentId')?.value || '',
    program: document.getElementById('setProgram')?.value || '',
    section: document.getElementById('setSection')?.value || '',
    email: document.getElementById('setEmail')?.value || ''
  };
  localStorage.setItem('attendtrack_profile', JSON.stringify(profile));
  updateUIWithProfile(profile);
  alert('Profile updated successfully!');
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
  alert('Logged out successfully.');
  window.location.replace('./student.html');
}

// ── SCHEDULE ──────────────────────────────────────
const WEEK_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_LABELS = {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'};

// Time slots every 30 min, 7:00 AM – 7:00 PM
const TIME_SLOTS = [];
for (let h = 7; h < 19; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2,'0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2,'0')}:30`);
}
TIME_SLOTS.push('19:00');

function parseTimeToMinutes(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + (m || 0);
}

function getSubjectTimeRange(subj) {
  const raw = subj.time.replace(/\s*–\s*/g,'–');
  const parts = raw.split('–');
  const endStr = parts[1].replace(/\s*(AM|PM)/i,'').trim();
  const startStr = parts[0].trim();
  const isPM = /PM/i.test(parts[1]);

  function toMin(s, forcepm) {
    let [h, m] = s.split(':').map(Number);
    if (!m) m = 0;
    if (forcepm && h !== 12) h += 12;
    if (!forcepm && h === 12) h = 0;
    return h * 60 + m;
  }

  let startMin = toMin(startStr, false);
  let endMin   = toMin(endStr, isPM);
  if (endMin <= startMin) endMin += 12 * 60;
  if (startMin < 7 * 60) startMin += 12 * 60;
  return {startMin, endMin};
}

function renderScheduleGrid() {
  const GRID_START  = 7 * 60; // 7:00 AM in minutes
  const SLOT_MIN    = 30;
  const TOTAL_SLOTS = 25;     // 7:00 AM → 7:00 PM (slots 0–24)
  const DAYS        = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const DAY_FULL    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const WEEKEND     = new Set(['Sat','Sun']);

  function minToSlot(min){ return Math.round((min - GRID_START) / SLOT_MIN); }

  // Format time label: "7:00", "7:30", "8:00" …
  function slotLabel(slotIdx) {
    const totalMin = GRID_START + slotIdx * SLOT_MIN;
    const h  = Math.floor(totalMin / 60);
    const m  = totalMin % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2,'0')}`;
  }

  let html = `<div class="sched-outer"><div class="sched-grid">`;

  // Corner
  html += `<div class="sg-corner"></div>`;

  // Day headers (grid-row 1, cols 2–8)
  DAYS.forEach((d, i) => {
    html += `<div class="sg-day-head${WEEKEND.has(d)?' is-weekend':''}" style="grid-column:${i+2};grid-row:1">
      <span>${DAY_FULL[i]}</span>
    </div>`;
  });

  // Time gutter + background cells — one row per 30-min slot
  for (let s = 0; s < TOTAL_SLOTS; s++) {
    const row     = s + 2;                        // row 1 = header
    const isHour  = (s % 2 === 0);               // even slots = :00, odd = :30
    const typeClass = isHour ? 'hour' : 'half';

    // Time label cell — always visible, always centered
    html += `<div class="sg-time ${typeClass}" style="grid-column:1;grid-row:${row}">
      <span>${slotLabel(s)}</span>
    </div>`;

    // 7 day background cells
    DAYS.forEach((d, i) => {
      html += `<div class="sg-cell ${typeClass}${WEEKEND.has(d)?' is-weekend':''}" style="grid-column:${i+2};grid-row:${row}"></div>`;
    });
  }

  // Event blocks — placed via grid-column / grid-row (no absolute positioning)
  SUBJECTS.forEach(subj => {
    const {startMin, endMin} = getSubjectTimeRange(subj);
    const startSlot = minToSlot(startMin);
    const endSlot   = minToSlot(endMin);
    const span      = Math.max(1, endSlot - startSlot);
    const rowStart  = startSlot + 2;
    const rowEnd    = rowStart + span;
    const t1 = slotLabel(startSlot);
    const t2 = slotLabel(endSlot);

    subj.days.forEach(dow => {
      const colIdx = DAYS.indexOf(dow);
      if (colIdx === -1) return;
      html += `<div class="sg-event" style="
        grid-column:${colIdx+2};
        grid-row:${rowStart}/${rowEnd};
        border-left:3px solid ${subj.color};
        background:${subj.color}1c;
      ">
        <div class="sg-event-name" style="color:${subj.color}">${subj.name}</div>
        <div class="sg-event-row">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${subj.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg>
          ${t1} – ${t2}
        </div>
        <div class="sg-event-row">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${subj.room}
        </div>
        <div class="sg-event-row teacher">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${subj.teacher}
        </div>
      </div>`;
    });
  });

  html += `</div></div>`;
  document.getElementById('schedGrid').innerHTML = html;

  // Subject detail table
  const tbody = document.getElementById('schedSubjectBody');
  if (tbody) {
    tbody.innerHTML = SUBJECTS.map(s => `
      <tr>
        <td><div class="subject-cell"><div class="subject-dot" style="background:${s.color}"></div>${s.name}</div></td>
        <td>${s.days.join(', ')}</td>
        <td><span class="mono">${s.time}</span></td>
        <td><span class="mono">${s.room}</span></td>
        <td style="color:var(--ink3)">${s.teacher}</td>
      </tr>
    `).join('');
  }
}

function minutesToTimeLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2,'0')} ${ap}`;
}

function formatHour(ts) {
  const [h] = ts.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh} ${ap}`;
}

// VIEW SWITCHING
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('[data-target]').forEach(a=>a.classList.toggle('active',a.dataset.target===id));
  document.getElementById('pageTitle').textContent=VIEW_META[id]?.title||'';
  document.getElementById('pageSub').textContent=VIEW_META[id]?.sub||'';
  if(id==='dashboardView') renderDashboard();
  if(id==='attendanceView'){renderSummaryChips();renderSubjectLegend();renderTable();}
  if(id==='scheduleView') renderScheduleGrid();
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
    if (profile.email) document.getElementById('setEmail').value = profile.email;
  }

  // Header Connectivity
  const profileBtn = document.getElementById('profileBtn');
  const profileDropdown = document.getElementById('profileDropdown');
  if (profileBtn && profileDropdown) {
    profileBtn.onclick = (e) => {
      e.stopPropagation();
      const isShowing = profileDropdown.style.display === 'block';
      profileDropdown.style.display = isShowing ? 'none' : 'block';
      // Close notification dropdown if open
      const notifDropdown = document.getElementById('notifDropdown');
      if (notifDropdown) notifDropdown.style.display = 'none';
    };
    profileDropdown.onclick = (e) => e.stopPropagation();
  }

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
        // Close profile dropdown if open
        if (profileDropdown) profileDropdown.style.display = 'none';
      }
    };
    notifDropdown.onclick = (e) => e.stopPropagation();
  }

  // Hide dropdown when clicking elsewhere
  window.addEventListener('click', () => { if (notifDropdown) notifDropdown.style.display = 'none'; if (profileDropdown) profileDropdown.style.display = 'none'; });


  // Settings Buttons Connectivity
  const saveBtn = document.getElementById('saveProfileBtn');
  if (saveBtn) saveBtn.onclick = saveProfile;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;
  
  // ── Password & Security ──────────────────────────
  const passToggle   = document.getElementById('passwordToggle');
  const passCollapse = document.getElementById('passwordCollapse');
  const passChevron  = document.getElementById('passChevron');
  if (passToggle && passCollapse) {
    passToggle.onclick = () => {
      const isHidden = passCollapse.style.display === 'none';
      passCollapse.style.display = isHidden ? 'block' : 'none';
      if (passChevron) passChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    };
  }

  // Show/hide eye toggles
  document.querySelectorAll('.pass-eye').forEach(btn => {
    btn.onclick = () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.querySelector('.eye-show').style.display = isText ? '' : 'none';
      btn.querySelector('.eye-hide').style.display = isText ? 'none' : '';
    };
  });

  // Password strength checker
  function checkStrength(pw) {
    const rules = {
      len:   pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      num:   /[0-9]/.test(pw),
      sym:   /[^A-Za-z0-9]/.test(pw),
    };
    const score = Object.values(rules).filter(Boolean).length;
    return { rules, score };
  }

  const STRENGTH_LEVELS = [
    { label: 'Too weak',  color: '#EF4444', width: '20%'  },
    { label: 'Weak',      color: '#F97316', width: '40%'  },
    { label: 'Fair',      color: '#F59E0B', width: '60%'  },
    { label: 'Strong',    color: '#10B981', width: '80%'  },
    { label: 'Very strong', color: '#059669', width: '100%' },
  ];

  const newPassInput = document.getElementById('newPassword');
  const confirmInput = document.getElementById('confirmNewPassword');

  if (newPassInput) {
    newPassInput.addEventListener('input', () => {
      const pw = newPassInput.value;
      const strengthWrap = document.getElementById('strengthWrap');
      const strengthFill = document.getElementById('strengthFill');
      const strengthLabel = document.getElementById('strengthLabel');

      if (!pw) {
        strengthWrap.style.display = 'none';
        ['len','upper','lower','num','sym'].forEach(r => {
          document.getElementById('req-'+r)?.classList.remove('req-met','req-fail');
        });
        return;
      }

      strengthWrap.style.display = 'flex';
      const { rules, score } = checkStrength(pw);
      const level = STRENGTH_LEVELS[Math.max(0, score - 1)];
      strengthFill.style.width = level.width;
      strengthFill.style.background = level.color;
      strengthLabel.textContent = level.label;
      strengthLabel.style.color = level.color;

      // Update requirement items
      Object.entries(rules).forEach(([key, met]) => {
        const el = document.getElementById('req-' + key);
        if (!el) return;
        el.classList.toggle('req-met', met);
        el.classList.toggle('req-fail', !met);
      });

      // Re-check match if confirm has a value
      if (confirmInput.value) confirmInput.dispatchEvent(new Event('input'));
    });
  }

  if (confirmInput) {
    confirmInput.addEventListener('input', () => {
      const matchMsg = document.getElementById('matchMsg');
      if (!matchMsg) return;
      const pw = newPassInput?.value || '';
      const cf = confirmInput.value;
      if (!cf) { matchMsg.style.display = 'none'; return; }
      matchMsg.style.display = 'flex';
      if (pw === cf) {
        matchMsg.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span style="color:var(--green)">Passwords match</span>`;
      } else {
        matchMsg.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg><span style="color:var(--red)">Passwords do not match</span>`;
      }
    });
  }

  // Load last changed date
  const lastChanged = localStorage.getItem('attendtrack_pw_changed');
  if (lastChanged) {
    const d = new Date(lastChanged);
    document.getElementById('lastChangedLabel').textContent = d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }

  // Change Password submit
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.onclick = () => {
      const current = document.getElementById('currentPassword').value;
      const newPw   = newPassInput?.value || '';
      const confirm = confirmInput?.value || '';
      const successMsg = document.getElementById('passSuccessMsg');

      if (!current || !newPw || !confirm) {
        showPassError('Please fill in all password fields.'); return;
      }
      if (newPw !== confirm) {
        showPassError('New passwords do not match.'); return;
      }
      const { score } = checkStrength(newPw);
      if (score < 3) {
        showPassError('Password is too weak. Please meet more of the requirements.'); return;
      }

      // Save timestamp
      const now = new Date().toISOString();
      localStorage.setItem('attendtrack_pw_changed', now);
      const d = new Date(now);
      document.getElementById('lastChangedLabel').textContent = d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

      // Clear fields & show success
      document.getElementById('currentPassword').value = '';
      newPassInput.value = '';
      confirmInput.value = '';
      document.getElementById('strengthWrap').style.display = 'none';
      document.getElementById('matchMsg').style.display = 'none';
      ['len','upper','lower','num','sym'].forEach(r => {
        document.getElementById('req-'+r)?.classList.remove('req-met','req-fail');
      });
      if (successMsg) {
        successMsg.style.display = 'flex';
        setTimeout(() => { successMsg.style.display = 'none'; }, 4000);
      }
    };
  }

  function showPassError(msg) {
    const existing = document.getElementById('passErrMsg');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'passErrMsg';
    el.style.cssText = 'margin:8px 18px 0;padding:10px 14px;background:var(--red-pale);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius-sm);font-size:12.5px;color:var(--red);display:flex;align-items:center;gap:8px';
    el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${msg}`;
    document.getElementById('changePasswordBtn').before(el);
    setTimeout(() => el.remove(), 4000);
  }

  document.querySelectorAll('[data-target]').forEach(a=>{
    a.onclick=e=>{e.preventDefault();showView(a.dataset.target);closeMini();}
  });

  showView('dashboardView');
});
