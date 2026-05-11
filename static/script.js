// ══════════════════════════════════════════
// AttendTrack — Self-contained, no backend needed
// ══════════════════════════════════════════

var SUBJECTS = [];
var NOTIFICATIONS_DATA = [];
var USER_PROFILE = {};
window.HAS_ENROLLMENTS = false;

// ── DATABASE FETCH FUNCTIONS ──────────────────────────
async function fetchSubjects() {
  try {
    // For students, use /api/student-subjects (has proper time field)
    // For teachers, use /api/user-subjects (returns their classes)
    const endpoint = window.location.pathname.includes('teacher') ? '/api/user-subjects' : '/api/student-subjects';
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Failed to fetch subjects');
    const data = await response.json();
    window.HAS_ENROLLMENTS = (data.subjects && data.subjects.length > 0) || (data.pending && data.pending.length > 0);
    return data.subjects || [];
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return [];
  }
}

async function fetchNotifications() {
  try {
    const response = await fetch('/api/notifications');
    if (!response.ok) throw new Error('Failed to fetch notifications');
    const data = await response.json();
    return data.notifications || [];
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
}

async function fetchUserProfile() {
  try {
    const response = await fetch('/api/user-profile');
    if (!response.ok) throw new Error('Failed to fetch profile');
    const profile = await response.json();
    
    // Parse the registered name in "Lastname, Firstname" format
    let fName = 'User', lName = '';
    if (profile.name) {
      const nameParts = profile.name.split(', ');
      if (nameParts.length >= 2) {
        lName = nameParts[0].trim();
        fName = nameParts[1].trim();
      } else {
        // Fallback for old format
        const parts = profile.name.trim().split(' ');
        fName = parts[0];
        lName = parts[parts.length - 1];
      }
    }

    return {
      firstName: fName,
      middleName: '',  // No middle name in new format
      lastName: lName,
      studentId: profile.student_number || profile.id ? (profile.student_number || profile.id.slice(0, 8)).toUpperCase() : '',
      program: profile.department || '',
      section: profile.section || '',
      email: profile.email || '',
      password: '',
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return {
      firstName: 'User',
      middleName: '',
      lastName: '',
      studentId: '',
      program: '',
      section: '',
      email: '',
      password: '',
    };
  }
}

async function fetchAttendanceRecords() {
  try {
    const response = await fetch('/api/user-attendance');
    if (!response.ok) throw new Error('Failed to fetch attendance');
    const data = await response.json();
    return (data.attendance || []).map(function(r) {
      r.subjId = r.subject_id || r.subjId;
      if (!r.subjName) {
        var s = window.SUBJECTS ? window.SUBJECTS.find(function(x) { return Number(x.id) === Number(r.subjId); }) : null;
        r.subjName = s ? s.name : 'Unknown Subject';
      }
      return r;
    });
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return [];
  }
}

// ── HELPER FUNCTIONS ──────────────────────────
function handleSubjectSelection(event) {
  var checkbox    = event.target;
  var classId     = checkbox.dataset.classId;
  var subjectId   = parseInt(checkbox.dataset.subjectId);
  var subjectName = checkbox.dataset.subjectName;

  if (checkbox.checked) {
    if (!selectedSubjects.find(function(s){ return s.classId === classId && s.subjectId === subjectId; })) {
      selectedSubjects.push({ classId: classId, subjectId: subjectId, subjectName: subjectName });
    }
  } else {
    selectedSubjects = selectedSubjects.filter(function(s){
      return !(s.classId === classId && s.subjectId === subjectId);
    });
  }
  updateSelectedSubjectsUI();
}
function getCounts(records) {
  return records.reduce(function(a,r){
    a[r.status]=(a[r.status]||0)+1; a.total++; return a;
  },{present:0,absent:0,late:0,excused:0,total:0});
}

var TODAY       = new Date();
var TODAY_LABEL = TODAY.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
var SEMESTER_AY = '2nd Semester, A.Y. '+(TODAY.getFullYear()-1)+'\u2013'+TODAY.getFullYear();
var DAY_ABBR    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var TODAY_DOW   = DAY_ABBR[TODAY.getDay()];

var VIEW_META = {
  dashboardView:  {title:'Dashboard',         sub:'Overview \u00B7 Today, '+TODAY_LABEL},
  attendanceView: {title:'Attendance History', sub:SEMESTER_AY},
  scheduleView:   {title:'Weekly Schedule',    sub:''},
  mySubjectView:  {title:'My Subjects',        sub:'Manage your class enrollments'},
  settingsView:   {title:'Settings',           sub:'Profile & Preferences'},
};

var PAGE_SIZE = 20;
var currentPage    = 1;
var currentFilter  = 'all';
var currentMonth   = 'all';
var currentSubject = 'all';
var ALL_SEMESTER_RECORDS = [];
var ALL_RECORDS = [];

function getFilteredRecords(filter, month, subject) {
  var recs = ALL_SEMESTER_RECORDS;
  if (filter  && filter  !== 'all') recs = recs.filter(function(r){ return r.status  === filter; });
  if (month   && month   !== 'all') recs = recs.filter(function(r){ return r.date.split('-')[1] === month.padStart(2,'0'); });
  if (subject && subject !== 'all') recs = recs.filter(function(r){ return r.subjId  === subject; });
  return recs;
}

// ── CLOCK ──────────────────────────────────────────────
function updateClock() {
  var n=new Date(),h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();
  var ap=h>=12?'PM':'AM',hh=h%12||12;
  var el=document.getElementById('liveTime');
  if(el) el.textContent=String(hh).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+' '+ap;
}

// ── GREETING ───────────────────────────────────────────
function updateGreeting() {
  var h=new Date().getHours();
  var sal=h>=5&&h<12?'Good morning':h>=12&&h<18?'Good afternoon':h>=18&&h<22?'Good evening':'Good night';
  var el=document.getElementById('dashGreeting');
  if(el) el.textContent=sal+', '+USER_PROFILE.firstName+' \uD83D\uDC4B';
}

// ── ANIMATED COUNTER ───────────────────────────────────
function animCount(el,target,dur) {
  dur=dur||700; if(!el)return;
  var st=performance.now();
  (function step(now){
    var p=Math.min((now-st)/dur,1),e=1-Math.pow(1-p,3);
    el.textContent=Math.round(e*target);
    if(p<1)requestAnimationFrame(step); else el.textContent=target;
  })(performance.now());
}

// ── UPDATE SIDEBAR (first + last name only) ────────────
function updateSidebarUI() {
  var p = USER_PROFILE;
  var shortName = p.firstName + ' ' + p.lastName;          // No middle name
  var fullName  = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
  var initials  = ((p.firstName||'')[0]||'') + ((p.lastName||'')[0]||'');

  // Sidebar desktop
  var sAvatar = document.getElementById('sidebarAvatar');
  var sName   = document.getElementById('sidebarName');
  var sMeta   = document.getElementById('sidebarMeta');
  var sId     = document.getElementById('sidebarId');
  if(sAvatar) sAvatar.textContent = initials.toUpperCase();
  if(sName)   sName.textContent   = shortName;           // First + Last only
  if(sMeta)   sMeta.textContent   = p.program + ' \u00B7 Section ' + p.section;
  if(sId)     sId.textContent     = p.studentId;

  // Mini sidebar
  var mAvatar = document.getElementById('miniAvatar');
  var mName   = document.getElementById('miniName');
  var mMeta   = document.getElementById('miniMeta');
  if(mAvatar) mAvatar.textContent = initials.toUpperCase();
  if(mName)   mName.textContent   = shortName;           // First + Last only
  if(mMeta)   mMeta.textContent   = p.program + ' \u00B7 ' + p.section + ' \u00B7 #' + p.studentId;

  // Settings profile card (read-only — show complete info including middle name)
  var bigAvatar   = document.getElementById('profileAvatarBig');
  var fullNameEl  = document.getElementById('profileFullName');
  var subLineEl   = document.getElementById('profileSubLine');
  if(bigAvatar)  bigAvatar.textContent  = initials.toUpperCase();
  if(fullNameEl) fullNameEl.textContent = fullName;       // Full name with middle name
  if(subLineEl)  subLineEl.textContent  = p.program + ' \u00B7 Section ' + p.section;

  // Settings read-only fields
  function setROField(id, val) { 
    var el=document.getElementById(id); 
    if(el) {
      if(el.tagName === 'INPUT') el.value = val||'';
      else el.textContent = val||'\u2014';
    }
  }
  setROField('pFirstName',  p.firstName);
  setROField('pMiddleName', p.middleName);
  setROField('pLastName',   p.lastName);
  setROField('pStudentId',  p.studentId);
  setROField('pProgram',    p.program);
  setROField('pSection',    p.section);
  setROField('pEmail',      p.email);

  updateGreeting();
}

// ── TODAY'S CLASS LIST ─────────────────────────────────
function getClassStatus(subj) {
  var now  = new Date();
  var hNow = now.getHours()*60 + now.getMinutes();
  var range = getSubjectTimeRange(subj);
  var s = range.startMin, e = range.endMin;
  if (hNow >= s && hNow < e) return 'ongoing';
  if (hNow >= e)             return 'done';
  return 'upcoming';
}

function renderTodayClasses() {
  var container = document.getElementById('todayClassList');
  if (!container) return;

  var todaySubjects = SUBJECTS.filter(function(s) {
    return Array.isArray(s.days) && s.days.includes(TODAY_DOW);
  });

  var todaySchedEl = document.getElementById('todayScheduleDate');

  if (todaySubjects.length === 0) {
    if (todaySchedEl) todaySchedEl.textContent = TODAY_LABEL + ' · 0 classes';
    container.innerHTML = '<div style="padding:24px 18px;text-align:center;color:var(--ink5);font-size:13px">No classes today 🎉</div>';
    return;
  }

  // Group subjects by classId
  var classMap = {};
  todaySubjects.forEach(function(s) {
    var key = s.classId || ('noclass_' + s.id);
    if (!classMap[key]) {
      classMap[key] = { classId: s.classId, className: s.className || 'Unknown Class', subjects: [] };
    }
    classMap[key].subjects.push(s);
  });

  var classes = Object.values(classMap);
  if (todaySchedEl) todaySchedEl.textContent = TODAY_LABEL + ' · ' + classes.length + ' class' + (classes.length !== 1 ? 'es' : '');

  // I-sort ang mga klase at subjects: Ongoing (1st), Upcoming (2nd), Done (3rd)
  classes.forEach(function(cls) {
    var statuses = cls.subjects.map(function(s) { return getClassStatus(s); });
    cls.status = statuses.includes('ongoing') ? 'ongoing' : (statuses.includes('upcoming') ? 'upcoming' : 'done');
    cls.subjects.sort(function(a, b) {
      var rank = { 'ongoing': 1, 'upcoming': 2, 'done': 3 };
      return rank[getClassStatus(a)] - rank[getClassStatus(b)];
    });
  });
  classes.sort(function(a, b) {
    var rank = { 'ongoing': 1, 'upcoming': 2, 'done': 3 };
    return rank[a.status] - rank[b.status];
  });

  container.innerHTML = classes.map(function(cls, ci) {
    var dropId = 'classSubjDrop_' + ci;

    var subjectRows = cls.subjects.map(function(subj) {
  var status = getClassStatus(subj);
  var safeNameJs = subj.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var todayISO   = new Date().toISOString().split('T')[0];
  var recordToday = ALL_SEMESTER_RECORDS.find(function(r) { return r.date === todayISO && Number(r.subjId) === Number(subj.id); });

  var badgeHtml = '';
  if (recordToday) {
    var sColor = recordToday.status === 'present' ? '#10B981' : (recordToday.status === 'late' ? '#F59E0B' : '#8B5CF6');
    badgeHtml = '<span class="badge" style="font-size:10px;padding:3px 8px;background:var(--surface2);border:1px solid ' + sColor + '33;color:' + sColor + '">✓ ' + (recordToday.status.charAt(0).toUpperCase() + recordToday.status.slice(1)) + '</span>';
  } else if (status === 'ongoing') {
    badgeHtml = '<button class="btn btn-primary" style="font-size:10px;padding:6px 14px;height:auto;line-height:1;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(67,97,238,0.25);animation:pulse-soft 2s infinite" ' +
                'onclick="event.stopPropagation(); openPasscodeModal(\'' + subj.classId + '\',' + (subj.id || subj.subjId) + ',\'' + safeNameJs + '\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>' +
                'Enter Code</button>';
  } else if (status === 'done') {
    badgeHtml = '<span class="badge badge-completed" style="font-size:10px;padding:3px 8px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:10px;height:10px"><path d="M20 6L9 17l-5-5"/></svg>Done</span>';
  } else {
    badgeHtml = '<span class="badge badge-scheduled" style="font-size:10px;padding:3px 8px">Upcoming</span>';
  }

  var canSubmit  = status !== 'done' && !recordToday;

  return '<div style="display:flex;align-items:center;gap:10px;padding:12px 18px 12px 36px;border-bottom:1px solid var(--border);background:var(--surface2);' +
      (canSubmit ? 'cursor:pointer;' : '') + '" ' +
      (canSubmit ? 'onmouseenter="this.style.background=\'rgba(67,97,238,0.04)\'" onmouseleave="this.style.background=\'var(--surface2)\'" onclick="openPasscodeModal(\'' + subj.classId + '\',' + subj.id + ',\'' + safeNameJs + '\')"' : '') +
    '>' +
    '<div style="width:3px;height:30px;border-radius:999px;background:' + subj.color + ';flex-shrink:0"></div>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:12.5px;font-weight:600;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + subj.name + '</div>' +
      '<div style="font-size:11px;color:var(--ink5);margin-top:1px;font-family:var(--mono)">' + (subj.time || '') + ' · ' + (subj.room || 'TBA') + '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
      badgeHtml +
      (canSubmit
        ? '<svg style="width:13px;height:13px;color:var(--ink5)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
        : '') +
    '</div>' +
  '</div>';
}).join('');

    var classStatus = cls.status;
    var classChip   = classStatus === 'ongoing'
      ? '<span style="font-size:10px;font-weight:700;color:#10B981;background:rgba(16,185,129,0.1);padding:2px 8px;border-radius:999px">Ongoing</span>'
      : classStatus === 'upcoming'
      ? '<span style="font-size:10px;font-weight:700;color:#4361EE;background:var(--accent-bg);padding:2px 8px;border-radius:999px">Upcoming</span>'
      : '<span style="font-size:10px;font-weight:700;color:var(--ink5);background:var(--surface2);padding:2px 8px;border-radius:999px;border:1px solid var(--border)">Done</span>';

    return '' +
      '<div style="display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--border);">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#4361EE22,#4361EE11);border:1px solid #4361EE33;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4361EE" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:700;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + cls.className + '</div>' +
          '<div style="font-size:11px;color:var(--ink5);margin-top:1px">' + cls.subjects.length + ' subject' + (cls.subjects.length !== 1 ? 's' : '') + ' today</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
          classChip +
        '</div>' +
      '</div>' +
      '<div id="' + dropId + '" style="display:block">' + subjectRows + '</div>';
  }).join('');
}

function toggleClassDrop(dropId, headerEl) {
  var drop    = document.getElementById(dropId);
  var chevron = headerEl.querySelector('.class-drop-chevron');
  if (!drop) return;
  var isOpen = drop.style.display !== 'none';
  drop.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

async function submitAttendance(classId, subjectId, inputId, msgId, btnId) {
  var input  = document.getElementById(inputId);
  var msgEl  = document.getElementById(msgId);
  var btnEl  = document.getElementById(btnId);
  if (!input || !msgEl || !btnEl) return;

  var passcode = input.value.trim();

  btnEl.disabled = true;
  btnEl.textContent = 'Submitting...';
  msgEl.style.display = 'none';

  try {
    var response = await fetch('/api/submit-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ classId: classId, subjectId: subjectId, passcode: passcode })
    });

    var data = await response.json();

    if (!response.ok) {
      // Show error message inline
      msgEl.style.display = 'flex';
      msgEl.style.alignItems = 'center';
      msgEl.style.gap = '5px';
      msgEl.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<span style="color:#ef4444">' + (data.error || 'Failed to submit') + '</span>';
      btnEl.disabled = false;
      btnEl.textContent = 'Submit';
      return;
    }

    // Success — show status badge and lock the input
    var isLate   = data.status === 'late';
    var statusColor = isLate ? '#F59E0B' : '#10B981';
    var statusLabel = isLate ? 'Marked Late' : 'Marked Present';

    msgEl.style.display = 'flex';
    msgEl.style.alignItems = 'center';
    msgEl.style.gap = '5px';
    msgEl.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="' + statusColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<span style="color:' + statusColor + ';font-weight:600">' + statusLabel + ' successfully!</span>';

    input.disabled = true;
    input.style.background = 'var(--surface2)';
    btnEl.disabled = true;
    btnEl.style.background = statusColor;
    btnEl.textContent = statusLabel;

    // Refresh attendance records in background
    ALL_SEMESTER_RECORDS = await fetchAttendanceRecords();
    renderDashboard();

  } catch (err) {
    console.error('Submit attendance error:', err);
    msgEl.style.display = 'flex';
    msgEl.innerHTML = '<span style="color:#ef4444">Connection error. Please try again.</span>';
    btnEl.disabled = false;
    btnEl.textContent = 'Submit';
  }
}


// ── SUBJECT ATTENDANCE BARS ────────────────────────────
function renderSubjectBars() {
  var container = document.getElementById('subjectBars');
  if (!container) return;
  container.innerHTML = SUBJECTS.map(function(subj) {
    var recs    = ALL_SEMESTER_RECORDS.filter(function(r){ return r.subjId === subj.id; });
    var c       = getCounts(recs);
    var rate    = c.total ? Math.round((c.present/c.total)*100) : 0;
    var barColor= rate >= 80 ? '#10B981' : rate >= 65 ? '#F59E0B' : '#EF4444';
    return '<div class="subj-bar-row">' +
      '<div class="subj-bar-name" title="'+subj.name+'">'+subj.name+'</div>' +
      '<div class="subj-bar-track"><div class="subj-bar-fill" style="width:0%;background:'+barColor+'" data-width="'+rate+'%"></div></div>' +
      '<div class="subj-bar-pct" style="color:'+barColor+'">'+rate+'%</div>' +
    '</div>';
  }).join('');
  // Animate bars after a frame
  setTimeout(function(){
    container.querySelectorAll('.subj-bar-fill').forEach(function(el){
      el.style.width = el.dataset.width;
    });
  }, 80);
}

// ── DONUT + LEGEND ─────────────────────────────────────
function renderDonut(c) {
  var rate   = c.total ? Math.round((c.present/c.total)*100) : 0;
  var circum = 276.5;
  var offset = circum - (rate/100)*circum;
  setTimeout(function(){
    var donut = document.getElementById('donutPresent');
    if(donut) donut.style.strokeDashoffset = offset;
  }, 200);
  var pct = document.getElementById('donutPct');
  if(pct) pct.textContent = rate+'%';
  var lp=document.getElementById('legendPresent'); if(lp) lp.textContent=c.present+' Present';
  var la=document.getElementById('legendAbsent');  if(la) la.textContent=c.absent+' Absent';
  var ll=document.getElementById('legendLate');    if(ll) ll.textContent=c.late+' Late';
  var le=document.getElementById('legendExcused'); if(le) le.textContent=c.excused+' Excused';
}

// ── FULL DASHBOARD ─────────────────────────────────────
function renderDashboard() {
  updateGreeting();
  var semEl = document.getElementById('dashSemesterSub');
  if(semEl) semEl.textContent = "Here's your attendance overview \u2014 "+SEMESTER_AY;
  var attendEl = document.getElementById('attendSemesterSub');
  if(attendEl) attendEl.textContent = 'Complete log for '+SEMESTER_AY+' \u00B7 Jan 6 \u2013 '+TODAY_LABEL;

  var c    = getCounts(ALL_SEMESTER_RECORDS);
  var rate = c.total ? Math.round((c.present/c.total)*100) : 0;

  animCount(document.getElementById('dashPresent'), c.present);
  animCount(document.getElementById('dashAbsent'),  c.absent);
  animCount(document.getElementById('dashLate'),    c.late);

  var dr=document.getElementById('dashRate');       if(dr)  dr.textContent  = rate+'%';
  var drt=document.getElementById('dashRateTrend'); if(drt) drt.textContent = rate+'%';
  var at=document.getElementById('absentTrend');    if(at)  at.textContent  = c.absent<=5?'\u2713 OK':'! High';

  var badge=document.getElementById('sidebarAbsentBadge'); if(badge) badge.textContent=c.absent;

  // Quick stats
  var st=document.getElementById('statTotal');   if(st) st.textContent=c.total;
  var se=document.getElementById('statExcused'); if(se) se.textContent=c.excused;
  var statSubj=document.getElementById('statSubjects'); if(statSubj) statSubj.textContent=SUBJECTS.length;
  var sr2=document.getElementById('statRisk');
  if(sr2) {
    if      (rate>=85){ sr2.textContent='Low';    sr2.style.color='#10B981'; }
    else if (rate>=75){ sr2.textContent='Medium'; sr2.style.color='#F59E0B'; }
    else              { sr2.textContent='High';   sr2.style.color='#EF4444'; }
  }

  renderTodayClasses();
  renderSubjectBars();
  renderDonut(c);
}

// ── ATTENDANCE TABLE ───────────────────────────────────
var BADGE_MAP = {
  present:'<span class="badge badge-present"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>Present</span>',
  absent: '<span class="badge badge-absent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>Absent</span>',
  late:   '<span class="badge badge-late"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg>Late</span>',
  excused:'<span class="badge badge-excused"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>Excused</span>',
};

function renderTable() {
  var filtered   = getFilteredRecords(currentFilter, currentMonth, currentSubject);
  ALL_RECORDS    = filtered;
  var total      = filtered.length;
  var totalPages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  currentPage    = Math.min(currentPage, totalPages);
  var pageRecs   = filtered.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

  var html = '<table class="att-table"><thead><tr><th>Date</th><th>Day</th><th>Subject</th><th>Time</th><th>Room</th><th>Status</th></tr></thead><tbody>';
  if (pageRecs.length === 0) {
    html += '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--ink5)">No records found.</td></tr>';
  } else {
    pageRecs.forEach(function(r) {
      var subj = SUBJECTS.find(function(s){ return s.id===r.subjId; });
      html += '<tr>' +
        '<td><span class="mono">'+r.date+'</span></td>' +
        '<td><span class="mono" style="color:var(--ink4)">'+r.dow+'</span></td>' +
        '<td><div class="subject-cell"><div class="subject-dot" style="background:'+(subj?subj.color:'#888')+'"></div>'+r.subjName+'</div></td>' +
        '<td><span class="mono">'+r.time+'</span></td>' +
        '<td><span class="mono">'+r.room+'</span></td>' +
        '<td>'+(BADGE_MAP[r.status]||r.status)+'</td>' +
      '</tr>';
    });
  }
  html += '</tbody></table>';
  document.getElementById('historyTableWrap').innerHTML = html;

  var from = (currentPage-1)*PAGE_SIZE+1, to = Math.min(currentPage*PAGE_SIZE, total);
  var pHTML = '<div class="page-info">Showing <strong>'+(total>0?from:0)+'\u2013'+to+'</strong> of <strong>'+total+'</strong> records</div><div class="page-btns">';
  pHTML += '<button class="page-btn" id="pgPrev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>';
  var maxBtns=5, startP=Math.max(1,currentPage-2), endP=Math.min(totalPages,startP+maxBtns-1);
  if(endP-startP<maxBtns-1) startP=Math.max(1,endP-maxBtns+1);
  for(var p=startP;p<=endP;p++) pHTML+='<button class="page-btn'+(p===currentPage?' active':'')+'" data-page="'+p+'">'+p+'</button>';
  pHTML+='<button class="page-btn" id="pgNext"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button></div>';
  document.getElementById('pagination').innerHTML = pHTML;

  document.getElementById('pgPrev').onclick = function(){ if(currentPage>1){currentPage--;renderTable();} };
  document.getElementById('pgNext').onclick = function(){ if(currentPage<totalPages){currentPage++;renderTable();} };
  document.querySelectorAll('[data-page]').forEach(function(b){
    b.onclick=function(){ currentPage=parseInt(b.dataset.page); renderTable(); };
  });
}

function renderSummaryChips() {
  var c=getCounts(ALL_SEMESTER_RECORDS), rate=c.total?Math.round((c.present/c.total)*100):0;
  document.getElementById('summaryChips').innerHTML =
    '<div class="chip"><div class="chip-dot" style="background:var(--green)"></div>Present<span class="chip-count" style="color:var(--green)">'+c.present+'</span></div>'+
    '<div class="chip"><div class="chip-dot" style="background:var(--red)"></div>Absent<span class="chip-count" style="color:var(--red)">'+c.absent+'</span></div>'+
    '<div class="chip"><div class="chip-dot" style="background:var(--amber)"></div>Late<span class="chip-count" style="color:var(--amber)">'+c.late+'</span></div>'+
    '<div class="chip"><div class="chip-dot" style="background:var(--purple)"></div>Excused<span class="chip-count" style="color:var(--purple)">'+c.excused+'</span></div>'+
    '<div class="chip"><div class="chip-dot" style="background:var(--accent)"></div>Rate<span class="chip-count" style="color:var(--accent)">'+rate+'%</span></div>'+
    '<div class="chip" style="margin-left:auto"><span style="color:var(--ink5);font-size:12px">Jan 6 \u2013 '+TODAY_LABEL+'</span></div>';
}

function renderSubjectLegend() {
  var wrap=document.getElementById('subjectLegend');
  wrap.innerHTML='<div class="legend-item active" data-subj="all"><div class="legend-dot" style="background:var(--ink4)"></div>All Subjects</div>'+
    SUBJECTS.map(function(s){ return '<div class="legend-item" data-subj="'+s.id+'"><div class="legend-dot" style="background:'+s.color+'"></div>'+s.name+'</div>'; }).join('');
  wrap.querySelectorAll('.legend-item').forEach(function(el){
    el.onclick=function(){
      currentSubject=el.dataset.subj; currentPage=1;
      wrap.querySelectorAll('.legend-item').forEach(function(x){ x.classList.remove('active'); });
      el.classList.add('active'); renderTable();
    };
  });
}

// ── HEADER NOTIFICATIONS (dropdown) ───────────────────
function renderNotifDropdown() {
  var container=document.querySelector('#notifDropdown .card-body');
  if(!container) return;
  container.innerHTML=NOTIFICATIONS_DATA.map(function(n){
    return '<div class="notif-item '+(n.unread?'unread':'')+'">' +
      '<div class="notif-icon" style="background:'+n.bg+'"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+n.color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg></div>' +
      '<div style="flex:1"><div class="notif-title">'+n.title+'</div><div class="notif-text">'+n.text+'</div><div class="notif-time">'+n.time+'</div></div>' +
    '</div>';
  }).join('');
}

// ── LOGOUT ─────────────────────────────────────────────
function logout() {
  if(!window.confirm('Are you sure you want to log out?')) return;
  window.location.href = '/logout';
}

// ── SCHEDULE ───────────────────────────────────────────
function getSubjectTimeRange(subj) {
  if (!subj || typeof subj.time !== 'string' || !subj.time) {
    return { startMin: 0, endMin: 0 };
  }

  // Normalize any dash variant to –
  var raw = subj.time.replace(/\s*[-–—]\s*/g, '–');
  var parts = raw.split('–');

  if (parts.length < 2) {
    console.warn("Bad time format:", subj.time);
    return { startMin: 0, endMin: 0 };
  }

  var startStr = parts[0].trim();
  var endStr   = parts[1].replace(/\s*(AM|PM)/i, '').trim();

  // If no AM/PM marker, times are stored as 24h (HH:MM) — parse directly
  var isRaw24h = !/AM|PM/i.test(raw);
  var isPM     = /PM/i.test(parts[1]);

  function toMin(s, forcePM, is24) {
    var a = s.split(':');
    var h = parseInt(a[0], 10);
    var m = parseInt(a[1], 10) || 0;
    if (isNaN(h)) return 0;
    if (is24) return h * 60 + m;          // 24h: use as-is
    if (forcePM && h !== 12) h += 12;     // 12h PM conversion
    if (!forcePM && h === 12) h = 0;      // 12h midnight edge case
    return h * 60 + m;
  }

  var startMin = toMin(startStr, false, isRaw24h);
  var endMin   = toMin(endStr,   isPM,  isRaw24h);

  // 12h only: fix wraparound
  if (!isRaw24h && endMin <= startMin) endMin += 12 * 60;
  if (!isRaw24h && startMin < 7 * 60)  startMin += 12 * 60;

  return { startMin: startMin, endMin: endMin };
}

function renderScheduleGrid() {
  var GS=7*60,SM=30,TS=25;
  var DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var DAYF=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var WE={Sat:true,Sun:true};
  function minToSlot(min){ return Math.round((min-GS)/SM); }
  function slotLabel(i){ var t=GS+i*SM,h=Math.floor(t/60),m=t%60,hh=h%12||12; return hh+':'+String(m).padStart(2,'0'); }

  var html='<div class="sched-outer"><div class="sched-grid"><div class="sg-corner"></div>';
  DAYS.forEach(function(d,i){ html+='<div class="sg-day-head'+(WE[d]?' is-weekend':'')+'" style="grid-column:'+(i+2)+';grid-row:1"><span>'+DAYF[i]+'</span></div>'; });
  for(var s=0;s<TS;s++){
    var row=s+2,tc=s%2===0?'hour':'half';
    html+='<div class="sg-time '+tc+'" style="grid-column:1;grid-row:'+row+'"><span>'+slotLabel(s)+'</span></div>';
    DAYS.forEach(function(d,i){ html+='<div class="sg-cell '+tc+(WE[d]?' is-weekend':'')+'" style="grid-column:'+(i+2)+';grid-row:'+row+'"></div>'; });
  }
  SUBJECTS.forEach(function(subj){
    var r=getSubjectTimeRange(subj),ss=minToSlot(r.startMin),es=minToSlot(r.endMin);
    var span=Math.max(1,es-ss),rs=ss+2,re=rs+span,t1=slotLabel(ss),t2=slotLabel(es);
    subj.days.forEach(function(dow){
      var ci=DAYS.indexOf(dow); if(ci===-1)return;
      html+='<div class="sg-event" style="grid-column:'+(ci+2)+';grid-row:'+rs+'/'+re+';border-left:3px solid '+subj.color+';background:'+subj.color+'1c;">'+
        '<div class="sg-event-name" style="color:'+subj.color+'">'+subj.name+'</div>'+
        '<div class="sg-event-row"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="'+subj.color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg>'+t1+' \u2013 '+t2+'</div>'+
        '<div class="sg-event-row"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'+subj.room+'</div>'+
        '<div class="sg-event-row teacher"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'+subj.teacher+'</div>'+
      '</div>';
    });
  });
  html+='</div></div>';
  document.getElementById('schedGrid').innerHTML=html;
  var tbody=document.getElementById('schedSubjectBody');
  if(tbody) tbody.innerHTML=SUBJECTS.map(function(s){
    return '<tr><td><div class="subject-cell"><div class="subject-dot" style="background:'+s.color+'"></div>'+s.name+'</div></td><td>'+s.days.join(', ')+'</td><td><span class="mono">'+s.time+'</span></td><td><span class="mono">'+s.room+'</span></td><td style="color:var(--ink3)">'+s.teacher+'</td></tr>';
  }).join('');
}

// ── VIEW SWITCHING ─────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(function(v){ v.classList.toggle('active',v.id===id); });
  document.querySelectorAll('[data-target]').forEach(function(a){ a.classList.toggle('active',a.dataset.target===id); });
  var pt=document.getElementById('pageTitle'), ps=document.getElementById('pageSub');
  if(pt) pt.textContent=VIEW_META[id]?VIEW_META[id].title:'';
  if(ps) ps.textContent=VIEW_META[id]?VIEW_META[id].sub:'';

  // Ibalik ang "Enroll" button kapag nasa Dashboard, itago sa ibang views
  var enrollBtn = document.getElementById('enrollBtn');
  if(enrollBtn) enrollBtn.style.display = (id === 'dashboardView' && !window.HAS_ENROLLMENTS) ? '' : 'none';

  if(id==='dashboardView')  renderDashboard();
  if(id==='attendanceView') renderAttendanceView();
  if(id==='scheduleView')   renderScheduleGrid();
  if(id==='mySubjectView')  renderMySubjects();
}

function renderMySubjects() {
  var tbody = document.getElementById('mySubjectsTableBody');
  if (!tbody) return;

  // Awtomatikong itago ang "Actions" column header kung nasa HTML pa ito
  var theadTr = tbody.closest('table') ? tbody.closest('table').querySelector('thead tr') : null;
  if (theadTr && theadTr.children.length >= 6) {
    theadTr.children[5].style.display = 'none';
  }

  // Hanapin at itago ang anumang button na may text na "Add" o "Enroll" sa loob ng My Subjects view
  var mySubjectView = document.getElementById('mySubjectView');
  if (mySubjectView) {
    var btns = mySubjectView.querySelectorAll('button');
    btns.forEach(function(btn) {
      if (btn.textContent.toLowerCase().includes('add') || btn.textContent.toLowerCase().includes('enroll')) {
        btn.style.display = 'none';
      }
    });
  }

  if (SUBJECTS.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--ink5)">You are not enrolled in any subjects yet.</td></tr>';
    return;
  }

  tbody.innerHTML = SUBJECTS.map(function(s) {
    var safeNameJs = escapeHTML(s.name).replace(/'/g, "\\'");
    return '<tr>' +
      '<td><div class="subject-cell"><div class="subject-dot" style="background:' + (s.color || 'var(--accent)') + '"></div>' +
      '<span style="font-weight:600">' + escapeHTML(s.name) + '</span></div></td>' +
      '<td>' + escapeHTML(s.className || '—') + '</td>' +
      '<td>' + escapeHTML(s.teacher || 'TBA') + '</td>' +
      '<td><span class="mono">' + (s.days || []).join(', ') + '<br>' + (s.time || '') + '</span></td>' +
      '<td><span class="mono">' + escapeHTML(s.room || 'TBA') + '</span></td>' +
    '</tr>';
  }).join('');
}

// ── HAMBURGER ──────────────────────────────────────────
function closeMini() {
  var ms=document.getElementById('miniSidebar'),ov=document.getElementById('overlay');
  if(ms)ms.classList.remove('show'); if(ov)ov.classList.remove('show');
}

// ── PASSWORD ───────────────────────────────────────────
function checkStrength(pw) {
  var rules={len:pw.length>=8,upper:/[A-Z]/.test(pw),lower:/[a-z]/.test(pw),num:/[0-9]/.test(pw),sym:/[^A-Za-z0-9]/.test(pw)};
  return {rules:rules,score:Object.values(rules).filter(Boolean).length};
}
function showPassError(msg) {
  var ex=document.getElementById('passErrMsg'); if(ex)ex.remove();
  var el=document.createElement('div'); el.id='passErrMsg';
  el.style.cssText='margin:8px 18px 0;padding:10px 14px;background:var(--red-pale);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius-sm);font-size:12.5px;color:var(--red);display:flex;align-items:center;gap:8px';
  el.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'+msg;
  var btn=document.getElementById('changePasswordBtn'); if(btn)btn.before(el);
  setTimeout(function(){el.remove();},4000);
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
// ── ENROLLMENT MODAL FUNCTIONS ──────────────────────────

var selectedSubjects = [];
var currentSearchResults = [];
var currentEnrollments = new Set(); 
var currentPending = new Set();

function openEnrollmentModal() {
  document.getElementById('enrollmentModalBackdrop').style.display = 'flex';
  document.getElementById('enrollmentCode').focus();
}

function closeEnrollmentModal() {
  document.getElementById('enrollmentModalBackdrop').style.display = 'none';
  document.getElementById('enrollmentCode').value = '';
  document.getElementById('enrollmentResults').style.display = 'none';
  document.getElementById('noResults').style.display = 'none';
  document.getElementById('selectedSubjectsSection').style.display = 'none';
  document.getElementById('confirmEnrollBtn').style.display = 'none';
  selectedSubjects = [];
  currentSearchResults = [];
  updateSelectedSubjectsUI();
  currentPending = new Set();
}

async function searchClasses() {
  const code = document.getElementById('enrollmentCode').value.trim();
  if (!code || code.length < 2) return;

  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) { searchBtn.disabled = true; searchBtn.textContent = 'Searching...'; }

  document.getElementById('enrollmentResults').style.display = 'none';
  document.getElementById('noResults').style.display = 'none';

  try {
    // Fetch search results AND current enrollments in parallel
    const [searchRes, enrollRes] = await Promise.all([
      fetch(`/api/search-subject?code=${encodeURIComponent(code)}`, { credentials: 'same-origin' }),
      fetch('/api/student-subjects', { credentials: 'same-origin' })
    ]);

    if (!searchRes.ok) {
      if (searchRes.status === 404) {
        document.getElementById('noResults').style.display = 'block';
        return;
      }
      let errorMsg = 'Search failed';
      try { const e = await searchRes.json(); errorMsg = e.error || errorMsg; } catch (_) {}
      showToast(errorMsg, 'error');
      return;
    }

    const data = await searchRes.json();
    currentSearchResults = data.results || [];

    // Build a Set of "classId::subjectId" strings for O(1) lookup
    if (enrollRes.ok) {
      const enrollData = await enrollRes.json();
      currentEnrollments = new Set(
        (enrollData.subjects || []).map(s => `${s.classId}::${s.id}`)
      );
      currentPending = new Set(
        (enrollData.pending || []).map(p => `${p.classId}::${p.subjectId}`)
      );
    } else {
      currentEnrollments = new Set();
      currentPending = new Set();
    }

    if (currentSearchResults.length === 0) {
      document.getElementById('noResults').style.display = 'block';
      return;
    }

    renderSearchResults();
  } catch (error) {
    console.error('Search error:', error);
    showToast('Connection error. Please refresh the page.', 'error');
  } finally {
    if (searchBtn) { searchBtn.disabled = false; searchBtn.textContent = 'Search'; }
  }
}

function renderSearchResults() {
  const resultsContainer = document.getElementById('resultsContainer');
  resultsContainer.innerHTML = '';

  currentSearchResults.forEach(result => {
    const classDiv = document.createElement('div');
    classDiv.style.cssText = 'padding:12px;border:1px solid var(--border2);border-radius:8px;background:var(--surface1)';

    const subjects = result.subjects || [];
    const classCheckId = `class-${result.classId}`;
    const teacherName = result.teacherName || 'Unknown Teacher';

    const subjectMeta = subjects.map(s => ({
      classId: result.classId,
      subjectId: Math.trunc(Number(s.id)),
      subjectName: s.subject,
      enrolled: currentEnrollments.has(`${result.classId}::${Math.trunc(Number(s.id))}`),
      pending: currentPending.has(`${result.classId}::${Math.trunc(Number(s.id))}`)
    }));

    const unenrolledMeta = subjectMeta.filter(s => !s.enrolled && !s.pending);
    const allEnrolled = unenrolledMeta.length === 0;
    const subjectsPayload = JSON.stringify(unenrolledMeta).replace(/"/g, '&quot;');

    classDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        ${allEnrolled
          ? `<span style="width:16px;height:16px;border-radius:4px;background:var(--border2);display:inline-block;flex-shrink:0"></span>`
          : `<input type="checkbox" id="${classCheckId}" class="class-checkbox"
               data-class-id="${result.classId}"
               onchange="handleClassSelection(event, JSON.parse(this.dataset.subjects))"
               data-subjects="${subjectsPayload}"/>`
        }
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--ink2);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(result.className)}</div>
          <div style="font-size:11px;color:var(--ink5);margin-top:2px;display:flex;align-items:center;gap:4px">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${escapeHTML(teacherName)}
          </div>
        </div>
        <span style="font-size:11px;color:var(--ink5);font-weight:500;flex-shrink:0">${subjects.length} subject${subjects.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;padding-left:4px">
        ${subjectMeta.map(s => {
          if (s.enrolled) {
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.2)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M20 6L9 17l-5-5"/></svg>
                <span style="font-size:13px;color:var(--ink3);flex:1">${escapeHTML(s.subjectName)}</span>
                <span style="font-size:11px;font-weight:600;color:#10B981;margin-right:8px">Enrolled</span>
                <button type="button"
                  onclick="dropSubject('${s.classId}', ${s.subjectId}, '${escapeHTML(s.subjectName)}', this)"
                  style="border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.06);color:#ef4444;border-radius:6px;font-size:11.5px;font-weight:600;padding:4px 10px;cursor:pointer;line-height:1.4">
                  Drop
                </button>
              </div>
            `;
          } else if (s.pending) {
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span style="font-size:13px;color:var(--ink3);flex:1">${escapeHTML(s.subjectName)}</span>
                <span style="font-size:11px;font-weight:600;color:#F59E0B;margin-right:8px">Pending Approval</span>
                <button type="button"
                  onclick="dropSubject('${s.classId}', ${s.subjectId}, '${escapeHTML(s.subjectName)}', this)"
                  style="border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.06);color:#ef4444;border-radius:6px;font-size:11.5px;font-weight:600;padding:4px 10px;cursor:pointer;line-height:1.4">
                  Cancel
                </button>
              </div>
            `;
          } else {
            return `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--ink3);padding:4px 0">
                <input type="checkbox" class="subj-checkbox"
                       data-class-id="${s.classId}"
                       data-subject-id="${s.subjectId}"
                       data-subject-name="${escapeHTML(s.subjectName)}"
                       data-class-checkbox-id="${classCheckId}"
                       onchange="handleSubjectSelection(event)"/>
                <span>${escapeHTML(s.subjectName)}</span>
              </label>
            `;
          }
        }).join('')}
      </div>
    `;

    resultsContainer.appendChild(classDiv);
  });

  document.getElementById('enrollmentResults').style.display = 'block';
  document.getElementById('noResults').style.display = 'none';
}
async function dropSubject(classId, subjectId, subjectName, btnEl) {
  if (!window.confirm(`Drop "${subjectName}"? Your attendance records will be kept.`)) return;

  btnEl.disabled = true;
  btnEl.textContent = 'Dropping...';

  try {
    const response = await fetch(`/api/drop-subject?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      let errMsg = 'Failed to drop subject';
      try { const err = await response.json(); errMsg = err.error || errMsg; } catch (_) {}
      showToast(errMsg, 'error');
      btnEl.disabled = false;
      btnEl.textContent = 'Drop';
      return;
    }

    currentEnrollments.delete(`${classId}::${subjectId}`);
    currentPending.delete(`${classId}::${subjectId}`);
    showToast(`Dropped "${subjectName}" successfully`, 'success');
    renderSearchResults();
    loadStudentEnrollments();
  } catch (err) {
    console.error('Drop error:', err);
    showToast('Connection error', 'error');
    btnEl.disabled = false;
    btnEl.textContent = 'Drop';
  }
}

function handleClassSelection(event, subjects) {
  const classCheckbox = event.target;
  const isChecked = classCheckbox.checked;

  subjects.forEach(function(s) {
    const subjCheckbox = document.querySelector(
      `input.subj-checkbox[data-class-id="${s.classId}"][data-subject-id="${s.subjectId}"]`
    );
    if (subjCheckbox) {
      subjCheckbox.checked = isChecked;
      if (isChecked) {
        if (!selectedSubjects.find(sel => sel.classId === s.classId && sel.subjectId === s.subjectId)) {
          selectedSubjects.push({ classId: s.classId, subjectId: s.subjectId, subjectName: s.subjectName });
        }
      } else {
        selectedSubjects = selectedSubjects.filter(
          sel => !(sel.classId === s.classId && sel.subjectId === s.subjectId)
        );
      }
    }
  });

  updateSelectedSubjectsUI();
}

function updateSelectedSubjectsUI() {
  const section = document.getElementById('selectedSubjectsSection');
  const list = document.getElementById('selectedSubjectsList');
  const count = document.getElementById('selectedCount');
  const confirmBtn = document.getElementById('confirmEnrollBtn');

  if (selectedSubjects.length === 0) {
    section.style.display = 'none';
    confirmBtn.style.display = 'none';
  } else {
    section.style.display = 'block';
    confirmBtn.style.display = 'block';
    count.textContent = selectedSubjects.length;

    list.innerHTML = selectedSubjects.map((subject, idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:white;border-radius:6px;border:1px solid #bfdbfe">
        <span style="font-size:13px;color:var(--ink2)">${escapeHTML(subject.subjectName)}</span>
        <button type="button" onclick="removeSelectedSubject(${idx})" 
                style="border:none;background:none;color:#ef4444;cursor:pointer;font-size:18px;padding:0;width:20px;height:20px;display:grid;place-items:center">×</button>
      </div>
    `).join('');
  }
}
// ── PASSCODE MODAL ─────────────────────────────────────
function openPasscodeModal(classId, subjectId, subjectName) {
  // Check if already submitted today
  var existingMsg = document.getElementById('pcModal_msg');
  var modal = document.getElementById('passcodeModal');
  if (!modal) return;

  // Reset state
  document.getElementById('pcModal_title').textContent = subjectName;
  document.getElementById('pcModal_input').value = '';
  document.getElementById('pcModal_input').disabled = false;
  document.getElementById('pcModal_btn').disabled = false;
  document.getElementById('pcModal_btn').textContent = 'Submit Attendance';
  document.getElementById('pcModal_btn').style.background = '#4361EE';
  document.getElementById('pcModal_msg').style.display = 'none';
  document.getElementById('pcModal_msg').innerHTML = '';

  // Store current target on the modal for submit to read
  modal.dataset.classId   = classId;
  modal.dataset.subjectId = subjectId;

  modal.style.display = 'flex';
  setTimeout(function() {
    document.getElementById('pcModal_input').focus();
  }, 80);
}

function closePasscodeModal() {
  var modal = document.getElementById('passcodeModal');
  if (modal) modal.style.display = 'none';
}

async function submitPasscodeModal() {
  var modal     = document.getElementById('passcodeModal');
  var classId   = modal.dataset.classId;
  var subjectId = modal.dataset.subjectId;
  var input     = document.getElementById('pcModal_input');
  var btn       = document.getElementById('pcModal_btn');
  var msgEl     = document.getElementById('pcModal_msg');
  var passcode  = input.value.trim();

  btn.disabled        = true;
  btn.textContent     = 'Submitting...';
  msgEl.style.display = 'none';

  try {
    var response = await fetch('/api/submit-attendance', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',   // ✅ ensures cookies are sent
      body: JSON.stringify({
        classId:   classId,
        subjectId: subjectId,
        passcode:  passcode
      })
    });

    // ✅ Check content-type before parsing JSON
    var contentType = response.headers.get('content-type') || '';
    var data = contentType.includes('application/json')
      ? await response.json()
      : { error: 'Server error (status ' + response.status + ')' };

    // ✅ Handle session expired
    if (response.status === 401) {
      msgEl.style.display = 'flex';
      msgEl.style.padding = '10px 12px';
      msgEl.style.background = 'rgba(239,68,68,0.08)';
      msgEl.style.borderRadius = '8px';
      msgEl.innerHTML = '<span style="color:#ef4444;font-size:12.5px">Session expired. Please <a href="/login" style="color:#4361EE;font-weight:600">log in again</a>.</span>';
      btn.disabled    = false;
      btn.textContent = 'Submit Attendance';
      return;
    }

    if (!response.ok) {
          const isWrongPasscode = data.error && data.error.toLowerCase().includes('incorrect passcode');

          msgEl.style.display      = 'flex';
          msgEl.style.alignItems   = 'center';
          msgEl.style.gap          = '6px';
          msgEl.style.padding      = '12px 14px';
          msgEl.style.background   = isWrongPasscode ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)';
          msgEl.style.borderRadius = '8px';
          msgEl.style.border       = isWrongPasscode ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(239,68,68,0.25)';

          const iconColor = isWrongPasscode ? '#F59E0B' : '#ef4444';
          const iconPath  = isWrongPasscode
            ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

          msgEl.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + iconPath + '</svg>' +
            '<div style="display:flex;flex-direction:column;gap:2px">' +
              '<span style="color:' + iconColor + ';font-size:12.5px;font-weight:700">' +
                (isWrongPasscode ? '🔐 Wrong Passcode' : '⚠️ ' + (data.error || 'Failed to submit')) +
              '</span>' +
              (isWrongPasscode
                ? '<span style="color:var(--ink5);font-size:11px">The passcode you entered is incorrect. Please check with your teacher and try again.</span>'
                : '') +
            '</div>';

          // Shake the input to give visual feedback
          if (isWrongPasscode) {
            const input = document.getElementById('pcModal_input');
            input.style.borderColor = '#F59E0B';
            input.style.animation = 'none';
            input.offsetHeight; // reflow
            input.style.animation = 'shake 0.4s ease';
            input.select();
            setTimeout(() => {
              input.style.borderColor = '';
              input.style.animation = '';
            }, 1500);
          }

          btn.disabled    = false;
          btn.textContent = 'Submit Attendance';
          return;
        }

    // ── Success ──
    var isLate      = data.status === 'late';
    var statusColor = isLate ? '#F59E0B' : '#10B981';
    var statusLabel = isLate ? '✓ Marked Late' : '✓ Marked Present';

    msgEl.style.display      = 'flex';
    msgEl.style.alignItems   = 'center';
    msgEl.style.gap          = '6px';
    msgEl.style.padding      = '10px 12px';
    msgEl.style.background   = isLate ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)';
    msgEl.style.borderRadius = '8px';
    msgEl.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + statusColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<span style="color:' + statusColor + ';font-weight:600;font-size:12.5px">' + statusLabel + ' successfully!</span>';

    input.disabled       = true;
    btn.disabled         = true;
    btn.style.background = statusColor;
    btn.textContent      = statusLabel;

    ALL_SEMESTER_RECORDS = await fetchAttendanceRecords();
    renderDashboard();
    setTimeout(closePasscodeModal, 1500);

  } catch (err) {
    console.error('Submit error:', err);
    msgEl.style.display      = 'flex';
    msgEl.style.padding      = '10px 12px';
    msgEl.style.background   = 'rgba(239,68,68,0.08)';
    msgEl.style.borderRadius = '8px';
    msgEl.innerHTML = '<span style="color:#ef4444;font-size:12.5px">Connection error. Please try again.</span>';
    btn.disabled    = false;
    btn.textContent = 'Submit Attendance';
  }
}

function removeSelectedSubject(index) {
  selectedSubjects.splice(index, 1);
  
  // Uncheck the corresponding checkbox
  const checkbox = document.querySelector(
    `input[data-class-id="${selectedSubjects[index]?.classId}"][data-subject-id="${selectedSubjects[index]?.subjectId}"]`
  );
  if (checkbox) checkbox.checked = false;
  
  updateSelectedSubjectsUI();
}

async function confirmEnrollment() {
  if (selectedSubjects.length === 0) {
    showToast('Please select at least one subject', 'error');
    return;
  }

  const confirmBtn = document.getElementById('confirmEnrollBtn');
  confirmBtn.disabled = true;
  const originalText = confirmBtn.textContent;
  confirmBtn.textContent = 'Enrolling...';

  try {
    let successCount = 0;
    let failureCount = 0;
    let detailedError = "";

    for (const subject of selectedSubjects) {
      try {
        const response = await fetch('/api/enroll-subject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId: subject.classId,
            subjectId: subject.subjectId
          })
        });

        if (response.ok) {
          successCount++;
        } else {
          const error = await response.json();
          console.error('Enrollment error:', error);
          detailedError = error.error || "Unknown Error";
          failureCount++;
        }
      } catch (error) {
        console.error('Enrollment request error:', error);
        failureCount++;
      }
    }

    if (successCount > 0) {
      showToast(`Successfully sent enrollment requests for ${successCount} subject(s). Waiting for teacher approval.`, 'success');
      loadStudentEnrollments(); // Refresh the dashboard
      closeEnrollmentModal();
    }

    if (failureCount > 0) {
      showToast(`Failed to enroll in ${failureCount} subject(s)`, 'error');
      alert("Enrollment Failed! Database Error:\n\n" + detailedError + "\n\nPaki-reply sa akin ang eksaktong error message na ito para maayos natin.");
    }
  } catch (error) {
    console.error('Confirmation error:', error);
    showToast('Error during enrollment', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = originalText;
  }
}

async function loadStudentEnrollments() {
  try {
    const response = await fetch('/api/student-subjects');
    if (!response.ok) {
      console.error('Failed to load enrollments');
      return;
    }

    const data = await response.json();
    const subjects = data.subjects || [];

    window.HAS_ENROLLMENTS = (data.subjects && data.subjects.length > 0) || (data.pending && data.pending.length > 0);

    // Update SUBJECTS array for dashboard rendering
    SUBJECTS = subjects;

    // Itago ang enroll button agad kapag successful ang enrollment
    var enrollBtn = document.getElementById('enrollBtn');
    if (enrollBtn) enrollBtn.style.display = (!window.HAS_ENROLLMENTS && document.getElementById('dashboardView').classList.contains('active')) ? '' : 'none';

    // Update today's class list
    renderTodayClasses();
    renderMySubjects();
  } catch (error) {
    console.error('Error loading enrollments:', error);
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999;
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHTML(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return str.replace(/[&<>"']/g, m => map[m]);
}

// ── DOCUMENT READY ──────────────────────────

document.addEventListener('DOMContentLoaded', async function() {

  // Load data from database
  USER_PROFILE = await fetchUserProfile();
  
  SUBJECTS = (await fetchSubjects()).filter(function(s) {
  if (!s) return false;
  if (!s.time && s.start_time && s.end_time) {
    s.time = s.start_time + '–' + s.end_time;
  }

  // ✅ Build .name from .subject if .name is missing (raw DB shape)
  if (!s.name && s.subject) {
    s.name = s.subject;
  }

  // ✅ Normalize .days from "Mon, Tue" string to ["Mon", "Tue"] array
  if (!Array.isArray(s.days)) {
    s.days = s.days
      ? s.days.split(',').map(function(d){ return d.trim(); }).filter(Boolean)
      : [];
  }
  if (!s.time) {
    console.warn("Removed subject (missing time):", s);
    return false;
  }

  if (!Array.isArray(s.days)) {
    console.warn("Fixed missing days:", s);
    s.days = [];
  }

  if (!s.name) s.name = "Unnamed Subject";
  if (!s.room) s.room = "TBA";
  if (!s.teacher) s.teacher = "TBA";
  if (!s.color) s.color = "#888";

  return true;
});
  NOTIFICATIONS_DATA = await fetchNotifications();
  ALL_SEMESTER_RECORDS = await fetchAttendanceRecords();
  ALL_RECORDS = ALL_SEMESTER_RECORDS;

  updateClock();
  setInterval(updateClock,1000);
  updateSidebarUI();
  renderNotifDropdown();

  // ── Edit Profile ──
  var editProfileBtn = document.getElementById('editProfileBtn');
  var profileInputs = document.querySelectorAll('.profile-field-value-input');
  var isEditingProfile = false;

  if (editProfileBtn) {
    editProfileBtn.onclick = async function() {
      isEditingProfile = !isEditingProfile;
      if (isEditingProfile) {
        // Enable editing (Skip email and student ID for security reasons)
        profileInputs.forEach(function(inp) {
          if (inp.id !== 'pStudentId' && inp.id !== 'pEmail') {
            inp.removeAttribute('readonly');
            inp.classList.add('editable');
          }
        });
        editProfileBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Profile';
        editProfileBtn.classList.add('btn-primary');
        editProfileBtn.classList.remove('btn-ghost');
        document.getElementById('pFirstName').focus();
      } else {
        // Save changes
        editProfileBtn.innerHTML = 'Saving...';
        editProfileBtn.disabled = true;

        var updatedProfile = {
          firstName: document.getElementById('pFirstName').value.trim(),
          middleName: document.getElementById('pMiddleName').value.trim(),
          lastName: document.getElementById('pLastName').value.trim(),
          program: document.getElementById('pProgram').value.trim(),
          section: document.getElementById('pSection').value.trim(),
        };
        
        var newFullName = `${updatedProfile.lastName}, ${updatedProfile.firstName}`.trim();

        try {
          var response = await fetch('/api/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ name: newFullName, department: updatedProfile.program, section: updatedProfile.section })
          });
          
          var contentType = response.headers.get('content-type') || '';
          var result;
          if (contentType.includes('application/json')) {
            result = await response.json();
          } else {
            var text = await response.text();
            result = { error: response.status === 404 ? 'Endpoint not found. Did you restart the server?' : 'Server error: ' + text.substring(0, 60) };
          }
          if(!response.ok) throw new Error(result.error || 'Failed to update profile');

          Object.assign(USER_PROFILE, updatedProfile);
          showToast('Profile updated successfully!', 'success');
        } catch(err) {
          showToast('Failed to save: ' + err.message, 'error');
        }
        updateSidebarUI();
        profileInputs.forEach(function(inp) { inp.setAttribute('readonly', 'true'); inp.classList.remove('editable'); });
        editProfileBtn.disabled = false;
        editProfileBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit Profile';
        editProfileBtn.classList.remove('btn-primary');
        editProfileBtn.classList.add('btn-ghost');
      }
    };
  }

  // ── Navigation ──
  document.querySelectorAll('[data-target]').forEach(function(a){
    a.onclick=function(e){ e.preventDefault(); showView(a.dataset.target); closeMini(); };
  });

  // ── Hamburger ──
  document.addEventListener('click',function(e){
    if(e.target.id==='hamburger'||e.target.closest('#hamburger')){
      var ms=document.getElementById('miniSidebar'),ov=document.getElementById('overlay');
      if(ms)ms.classList.toggle('show'); if(ov)ov.classList.toggle('show'); return;
    }
    if(e.target.id==='overlay') closeMini();
  });

  // ── Filter & Month ──
  document.addEventListener('click',function(e){
    var fb=e.target.closest('[data-filter]');
    if(fb){ currentFilter=fb.dataset.filter; currentPage=1; document.querySelectorAll('[data-filter]').forEach(function(b){b.classList.toggle('active',b===fb);}); renderTable(); return; }
    var mb=e.target.closest('[data-month]');
    if(mb){ currentMonth=mb.dataset.month; currentPage=1; document.querySelectorAll('[data-month]').forEach(function(b){b.classList.toggle('active',b===mb);}); renderTable(); return; }
  });

  // ── Export CSV ──
  document.addEventListener('click',function(e){
    if(e.target.closest('#exportBtn')){
      var csv=['Date,Day,Subject,Time,Room,Status'].concat(ALL_RECORDS.map(function(r){
        return '"'+r.date+'","'+r.dow+'","'+r.subjName+'","'+r.time+'","'+r.room+'","'+r.status+'"';
      })).join('\n');
      var a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
      a.download='attendance_semester.csv'; a.click();
    }
  });

  // ── Header dropdowns ──
  var profileBtn=document.getElementById('profileBtn'), profileDropdown=document.getElementById('profileDropdown');
  var notifBtn=document.getElementById('notifBtn'),     notifDropdown=document.getElementById('notifDropdown');

  if(profileBtn&&profileDropdown){
    profileBtn.onclick=function(e){ e.stopPropagation(); var s=profileDropdown.style.display==='block'; profileDropdown.style.display=s?'none':'block'; if(notifDropdown)notifDropdown.style.display='none'; };
    profileDropdown.onclick=function(e){e.stopPropagation();};
  }
  if(notifBtn&&notifDropdown){
    notifBtn.onclick=function(e){ e.stopPropagation(); var s=notifDropdown.style.display==='block'; notifDropdown.style.display=s?'none':'block'; if(!s){var dot=notifBtn.querySelector('.notif-dot');if(dot)dot.style.display='none'; if(profileDropdown)profileDropdown.style.display='none';} };
    notifDropdown.onclick=function(e){e.stopPropagation();};
  }
  window.addEventListener('click',function(){ if(notifDropdown)notifDropdown.style.display='none'; if(profileDropdown)profileDropdown.style.display='none'; });

  // ── Logout ──
  var lb=document.getElementById('logoutBtn'); if(lb)lb.onclick=logout;

  // ── Password collapse ──
  var pt2=document.getElementById('passwordToggle'),pc=document.getElementById('passwordCollapse'),pch=document.getElementById('passChevron');
  if(pt2&&pc){
    pt2.onclick=function(){ var h=pc.style.display==='none'; pc.style.display=h?'block':'none'; if(pch)pch.style.transform=h?'rotate(180deg)':'rotate(0deg)'; };
  }

  // ── Eye toggles ──
  document.querySelectorAll('.pass-eye').forEach(function(btn){
    btn.onclick=function(){
      var input=document.getElementById(btn.dataset.target); if(!input)return;
      var isText=input.type==='text'; input.type=isText?'password':'text';
      var es=btn.querySelector('.eye-show'),eh=btn.querySelector('.eye-hide');
      if(es)es.style.display=isText?'':'none'; if(eh)eh.style.display=isText?'none':'';
    };
  });

  // ── Password strength ──
  var SL=[{label:'Too weak',color:'#EF4444',width:'20%'},{label:'Weak',color:'#F97316',width:'40%'},{label:'Fair',color:'#F59E0B',width:'60%'},{label:'Strong',color:'#10B981',width:'80%'},{label:'Very strong',color:'#059669',width:'100%'}];
  var npi=document.getElementById('newPassword'), ci=document.getElementById('confirmNewPassword');

  if(npi){
    npi.addEventListener('input',function(){
      var pw=npi.value, sw=document.getElementById('strengthWrap'), sf=document.getElementById('strengthFill'), sl=document.getElementById('strengthLabel');
      if(!pw){ if(sw)sw.style.display='none'; ['len','upper','lower','num','sym'].forEach(function(r){var el=document.getElementById('req-'+r);if(el){el.classList.remove('req-met');el.classList.remove('req-fail');}}); return; }
      if(sw)sw.style.display='flex';
      var res=checkStrength(pw),lev=SL[Math.max(0,res.score-1)];
      if(sf){sf.style.width=lev.width;sf.style.background=lev.color;} if(sl){sl.textContent=lev.label;sl.style.color=lev.color;}
      Object.keys(res.rules).forEach(function(k){var el=document.getElementById('req-'+k);if(!el)return;el.classList.toggle('req-met',res.rules[k]);el.classList.toggle('req-fail',!res.rules[k]);});
      if(ci&&ci.value)ci.dispatchEvent(new Event('input'));
    });
  }
  if(ci){
    ci.addEventListener('input',function(){
      var mm=document.getElementById('matchMsg'); if(!mm)return;
      var pw=npi?npi.value:'', cf=ci.value;
      if(!cf){mm.style.display='none';return;} mm.style.display='flex';
      mm.innerHTML=pw===cf
        ?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span style="color:var(--green)">Passwords match</span>'
        :'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg><span style="color:var(--red)">Passwords do not match</span>';
    });
  }

  // ── Last changed ──
  var lc=localStorage.getItem('attendtrack_pw_changed');
  if(lc){var lcEl=document.getElementById('lastChangedLabel');if(lcEl)lcEl.textContent=new Date(lc).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}

  // ── Change password ──
  var cpBtn=document.getElementById('changePasswordBtn');
  if(cpBtn){
    cpBtn.onclick=function(){
      var cpEl=document.getElementById('currentPassword');
      var current=cpEl?cpEl.value:'', newPw=npi?npi.value:'', confirm=ci?ci.value:'';
      var sm=document.getElementById('passSuccessMsg');
      if(!current){showPassError('Please enter your current password.');return;}
      if(current!==USER_PROFILE.password){showPassError('Incorrect current password.');return;}
      if(!newPw){showPassError('Please enter a new password.');return;}
      if(newPw!==confirm){showPassError('Passwords do not match.');return;}
      if(checkStrength(newPw).score<3){showPassError('New password is too weak.');return;}
      USER_PROFILE.password=newPw;
      var now=new Date().toISOString(); localStorage.setItem('attendtrack_pw_changed',now);
      var lcLbl=document.getElementById('lastChangedLabel'); if(lcLbl)lcLbl.textContent=new Date(now).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      if(cpEl)cpEl.value=''; if(npi)npi.value=''; if(ci)ci.value='';
      var sw2=document.getElementById('strengthWrap'),mm2=document.getElementById('matchMsg');
      if(sw2)sw2.style.display='none'; if(mm2)mm2.style.display='none';
      ['len','upper','lower','num','sym'].forEach(function(r){var el=document.getElementById('req-'+r);if(el){el.classList.remove('req-met');el.classList.remove('req-fail');}});
      if(sm){sm.style.display='flex';setTimeout(function(){sm.style.display='none';},4000);}
    };
  }

  // ── Initial view ──
  showView('dashboardView');

  // ── Enrollment listeners ──
  var enrollBtn = document.getElementById('enrollBtn');
  if (enrollBtn) {
    enrollBtn.addEventListener('click', function() {
      document.getElementById('enrollmentModalBackdrop').style.display = 'flex';
      document.getElementById('enrollmentCode').focus();
    });
  }

  // Allow Enter key to search
  // Replace the existing enrollmentCodeInput keypress listener in DOMContentLoaded
var enrollmentCodeInput = document.getElementById('enrollmentCode');
if (enrollmentCodeInput) {
  // Search on Enter key
  enrollmentCodeInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') searchClasses();
  });

  // Live search while typing (debounced)
  let searchTimeout = null;
  enrollmentCodeInput.addEventListener('input', function() {
    const val = this.value.trim();

    // Clear previous results if input is empty
    if (val.length === 0) {
      document.getElementById('enrollmentResults').style.display = 'none';
      document.getElementById('noResults').style.display = 'none';
      return;
    }

    // Only search if at least 2 characters typed
    if (val.length < 2) return;

    // Debounce — wait 400ms after user stops typing
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchClasses();
    }, 400);
  });
}
});
function studentToDisplayDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d)) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
 
function studentFmtColDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return { day: dateStr, mon: '', year: '' };
  return {
    day:  String(d.getDate()).padStart(2, '0'),
    mon:  d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    year: String(d.getFullYear()),
  };
}
 
function studentCellStyle(status) {
  const map = {
    present: { bg: 'rgba(34,197,94,.15)',   color: '#22c55e', label: 'Present' },
    absent:  { bg: 'rgba(239,68,68,.15)',   color: '#ef4444', label: 'Absent'  },
    late:    { bg: 'rgba(245,158,11,.15)',  color: '#f59e0b', label: 'Late'    },
    excused: { bg: 'rgba(139,92,246,.15)',  color: '#a78bfa', label: 'Excused' },
    null:    { bg: 'rgba(30,41,59,.6)',      color: '#475569', label: '—'       },
  };
  return map[status] || map.null;
}
 
// ── Subject Picker (renders inside #attendanceView) ───────────────────
 
function renderAttendanceView() {
  // Called by showView('attendanceView')
  renderSummaryChips();      // existing chips
  renderStudentSubjectPicker();
}
 
function renderStudentSubjectPicker() {
  // Replace the filter-bar + table area with our subject picker
  const wrap = document.getElementById('historyTableWrap');
  const pagination = document.getElementById('pagination');
  const filterBar = document.querySelector('#attendanceView .filter-bar');
  const subjectLegend = document.getElementById('subjectLegend');
 
  // Hide old controls — we show them inside the grid panel instead
  if (filterBar) filterBar.style.display = 'none';
  if (subjectLegend) subjectLegend.style.display = 'none';
  if (pagination) pagination.innerHTML = '';
 
  if (!wrap) return;
 
  if (SUBJECTS.length === 0) {
    wrap.innerHTML = `
      <div style="padding:48px 20px;text-align:center;color:var(--ink5)">
        <div style="font-size:32px;margin-bottom:12px">📚</div>
        <div style="font-size:14px;font-weight:700;color:var(--ink3)">No subjects enrolled yet.</div>
        <div style="font-size:12px;margin-top:4px">Enroll in a class to see your attendance.</div>
      </div>`;
    return;
  }
 
  // One card per subject
  wrap.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--ink3);margin-bottom:2px">
        Select a subject to view your attendance records
      </div>
      <div style="font-size:11px;color:var(--ink5)">${SEMESTER_AY}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
      ${SUBJECTS.map((subj, i) => {
        const recs = ALL_SEMESTER_RECORDS.filter(r => Number(r.subjId) === Number(subj.id));
        const p = recs.filter(r => r.status === 'present').length;
        const a = recs.filter(r => r.status === 'absent').length;
        const l = recs.filter(r => r.status === 'late').length;
        const total = recs.length;
        const rate = total ? Math.round((p / total) * 100) : 0;
        const rateColor = rate >= 80 ? '#10b981' : rate >= 60 ? '#f59e0b' : '#ef4444';
 
        return `
          <div class="student-subj-card" data-subj-idx="${i}"
               style="background:var(--surface);border:1.5px solid var(--border);
                      border-radius:12px;padding:18px;cursor:pointer;
                      transition:all .18s;position:relative;overflow:hidden"
               onmouseover="this.style.borderColor='${subj.color}';this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)'"
               onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow='none'"
               onclick="openStudentAttendanceGrid(${i})">
            <!-- color strip -->
            <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${subj.color};border-radius:12px 0 0 12px"></div>
            <div style="padding-left:10px">
              <div style="font-size:13px;font-weight:700;color:var(--ink2);
                          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                          margin-bottom:4px">
                ${escapeHTML(subj.name)}
              </div>
              <div style="font-size:11px;color:var(--ink5);margin-bottom:12px">
                ${escapeHTML(subj.className || '')}
                ${subj.time ? ' · ' + escapeHTML(subj.time) : ''}
              </div>
              <!-- mini bar -->
              <div style="height:6px;border-radius:99px;background:var(--border);overflow:hidden;margin-bottom:6px">
                <div style="height:100%;width:${rate}%;background:${rateColor};
                             border-radius:99px;transition:width .8s ease"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="font-size:11px;color:var(--ink5)">
                  <span style="color:#10b981;font-weight:700">${p}P</span> ·
                  <span style="color:#ef4444;font-weight:700">${a}A</span>
                  ${l > 0 ? ` · <span style="color:#f59e0b;font-weight:700">${l}L</span>` : ''}
                  · ${total} total
                </div>
                <div style="font-size:13px;font-weight:800;color:${rateColor}">${rate}%</div>
              </div>
            </div>
            <!-- arrow -->
            <div style="position:absolute;right:14px;top:50%;transform:translateY(-50%);
                        color:var(--ink5);opacity:.5;font-size:18px">›</div>
          </div>`;
      }).join('')}
    </div>`;
}
 
// ── Main grid opener ──────────────────────────────────────────────────
 
function openStudentAttendanceGrid(subjIdx) {
  const subj = SUBJECTS[subjIdx];
  if (!subj) return;
 
  // Filter records for this subject only
  const records = ALL_SEMESTER_RECORDS.filter(r => Number(r.subjId) === Number(subj.id));
 
  // Build or reuse panel
  let panel = document.getElementById('studentAttendancePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'studentAttendancePanel';
    panel.style.cssText =
      'position:fixed;inset:0;z-index:1200;background:var(--surface,#f8fafc);' +
      'display:flex;flex-direction:column;overflow:hidden;font-family:var(--font,\'DM Sans\',sans-serif)';
    document.body.appendChild(panel);
  }
 
  panel.innerHTML = buildStudentGridHTML(subj, records);
  panel.style.display = 'flex';
 
  // Wire up close
  panel.querySelector('#studentAttBackBtn').addEventListener('click', () => {
    panel.style.display = 'none';
  });
 
  // Wire up export
  panel.querySelector('#studentAttExportBtn').addEventListener('click', () => {
    exportStudentAttendanceCSV(subj, records);
  });
 
  // Wire up search & date filters
  panel.querySelector('#sAttSearch').addEventListener('input', applyStudentFilters);
  panel.querySelector('#sAttDateFrom').addEventListener('change', applyStudentFilters);
  panel.querySelector('#sAttDateTo').addEventListener('change', applyStudentFilters);
  panel.querySelector('#sAttDateClear').addEventListener('click', () => {
    panel.querySelector('#sAttDateFrom').value = '';
    panel.querySelector('#sAttDateTo').value   = '';
    applyStudentFilters();
  });
 
  // Store current data for filter re-renders
  panel._subjIdx = subjIdx;
  panel._records = records;
 
  // Initial render
  renderStudentGrid(records, subj);
}
 
// ── HTML shell ────────────────────────────────────────────────────────
 
function buildStudentGridHTML(subj, records) {
  const p = records.filter(r => r.status === 'present').length;
  const a = records.filter(r => r.status === 'absent').length;
  const l = records.filter(r => r.status === 'late').length;
  const total = records.length;
  const rate = total ? Math.round((p / total) * 100) : 0;
  const rateColor = rate >= 80 ? '#10b981' : rate >= 60 ? '#f59e0b' : '#ef4444';
 
  return `
    <style>
      /* ── Student Attendance Panel ── */
      #studentAttendancePanel {
        --panel-bg: #f1f5f9;
        --header-bg: #fff;
        --border-c: rgba(15,23,42,.1);
        --ink: #0f172a;
        --ink3: #334155;
        --ink5: #64748b;
        background: var(--panel-bg);
      }
      .sat-topbar {
        background: var(--header-bg);
        border-bottom: 2px solid var(--border-c);
        padding: 0 24px;
        height: 62px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        gap: 12px;
        box-shadow: 0 1px 4px rgba(15,23,42,.06);
      }
      .sat-back-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1.5px solid var(--border-c);
        background: #f8fafc;
        color: var(--ink5);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all .15s;
      }
      .sat-back-btn:hover { background: #e2e8f0; color: var(--ink); }
      .sat-export-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 8px;
        border: none;
        background: #4361ee;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(67,97,238,.3);
        transition: all .15s;
      }
      .sat-export-btn:hover { background: #3451d1; }
      .sat-stat-card {
        background: #fff;
        border: 1.5px solid var(--border-c);
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 1px 4px rgba(15,23,42,.05);
      }
      .sat-stat-label {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: var(--ink5);
        margin-bottom: 4px;
      }
      .sat-stat-value {
        font-size: 26px;
        font-weight: 900;
        line-height: 1;
      }
      /* ── Table ── */
      .sat-table-wrap {
        overflow: auto;
        border: 1.5px solid var(--border-c);
        border-radius: 12px;
        box-shadow: 0 2px 12px rgba(15,23,42,.07);
        background: #fff;
      }
      #sAttTable {
        border-collapse: separate;
        border-spacing: 0;
        width: max-content;
        min-width: 100%;
      }
      #sAttTable thead th {
        background: #fff;
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .sat-th-info {
        min-width: 180px;
        padding: 14px 16px;
        text-align: left;
        font-size: 10px;
        font-weight: 800;
        color: var(--ink5);
        text-transform: uppercase;
        letter-spacing: .08em;
        border-right: 2px solid var(--border-c);
        border-bottom: 2px solid #4361ee;
        background: #fff;
      }
      .sat-th-rate {
        min-width: 90px;
        padding: 14px 10px;
        text-align: center;
        font-size: 10px;
        font-weight: 800;
        color: var(--ink5);
        text-transform: uppercase;
        letter-spacing: .08em;
        border-right: 2px solid var(--border-c);
        border-bottom: 2px solid #4361ee;
        background: #fff;
      }
      .sat-th-date {
        min-width: 90px;
        padding: 0;
        border-right: 1px solid rgba(15,23,42,.07);
        border-bottom: 2px solid #4361ee;
        text-align: center;
        vertical-align: bottom;
        background: #fff;
      }
      .sat-th-date-inner { padding: 10px 8px 12px; }
      .sat-th-date-mon { font-size: 9px; font-weight: 800; color: var(--ink5); letter-spacing: .1em; text-transform: uppercase; }
      .sat-th-date-day { font-size: 20px; font-weight: 900; color: var(--ink); line-height: 1; margin: 1px 0; }
      .sat-th-date-year { font-size: 9px; color: var(--ink5); }
      #sAttTable tbody tr { transition: background .1s; }
      #sAttTable tbody tr:hover td { background: #f8fafc !important; }
      .sat-td-info {
        padding: 0;
        border-right: 2px solid var(--border-c);
        border-bottom: 1.5px solid rgba(15,23,42,.06);
        min-width: 180px;
        max-width: 180px;
        background: #fff;
      }
      .sat-td-info-inner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        min-height: 52px;
      }
      .sat-td-rate {
        padding: 8px 10px;
        border-right: 2px solid var(--border-c);
        border-bottom: 1.5px solid rgba(15,23,42,.06);

        min-width: 90px;
        text-align: center;
        vertical-align: middle;
        background: #fff;
      }
      .sat-td-cell {
        padding: 0;
        border-right: 1px solid rgba(15,23,42,.06);
        border-bottom: 1.5px solid rgba(15,23,42,.06);
        text-align: center;
        background: #fff;
      }
      .sat-cell-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 52px;
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: .2px;
      }
      /* Search / date inputs */
      .sat-search {
        padding: 8px 14px 8px 36px;
        border: 1.5px solid var(--border-c);
        border-radius: 8px;
        font-size: 13px;
        outline: none;
        width: 220px;
        background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E") no-repeat 11px center;
        color: var(--ink);
        transition: border .15s, box-shadow .15s;
      }
      .sat-search:focus { border-color: #4361ee; box-shadow: 0 0 0 3px rgba(67,97,238,.12); }
      .sat-date-input {
        padding: 8px 10px;
        border: 1.5px solid var(--border-c);
        border-radius: 8px;
        font-size: 12px;
        outline: none;
        background: #fff;
        color: var(--ink);
        cursor: pointer;
        transition: border .15s;
      }
      .sat-date-input:focus { border-color: #4361ee; }
      .sat-clear-btn {
        padding: 6px 10px;
        border: 1.5px solid rgba(239,68,68,.3);
        border-radius: 7px;
        background: none;
        color: #ef4444;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      .sat-legend { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; padding: 8px 0; font-size: 11px; }
      .sat-legend-item { display: flex; align-items: center; gap: 5px; font-weight: 600; color: var(--ink3); }
      .sat-legend-dot { width: 12px; height: 12px; border-radius: 4px; border: 1.5px solid; }
      /* read-only banner */
      .sat-readonly-banner {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 99px;
        background: rgba(67,97,238,.08);
        border: 1px solid rgba(67,97,238,.18);
        font-size: 11px;
        font-weight: 700;
        color: #4361ee;
      }
    </style>
 
    <!-- Top bar -->
    <div class="sat-topbar">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <button id="studentAttBackBtn" class="sat-back-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <div style="min-width:0">
          <div style="font-size:15px;font-weight:800;color:var(--ink);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHTML(subj.name)}
          </div>
          <div style="font-size:11px;color:var(--ink5);margin-top:1px">
            ${escapeHTML(subj.className || '')}
            ${subj.time ? ' · ' + escapeHTML(subj.time) : ''}
            ${subj.room ? ' · ' + escapeHTML(subj.room) : ''}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div class="sat-readonly-banner">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          View Only
        </div>
        <button id="studentAttExportBtn" class="sat-export-btn">
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
 
    <!-- Stats -->
    <div id="sAttStatsRow"
         style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
                padding:16px 24px 0;flex-shrink:0">
      <div class="sat-stat-card">
        <div class="sat-stat-label">Total Sessions</div>
        <div class="sat-stat-value">${total}</div>
      </div>
      <div class="sat-stat-card">
        <div class="sat-stat-label">Present</div>
        <div class="sat-stat-value" style="color:#10b981">${p}</div>
      </div>
      <div class="sat-stat-card">
        <div class="sat-stat-label">Absent</div>
        <div class="sat-stat-value" style="color:#ef4444">${a}</div>
      </div>
      <div class="sat-stat-card">
        <div class="sat-stat-label">Attendance Rate</div>
        <div class="sat-stat-value" style="color:${rateColor}">${rate}%</div>
      </div>
    </div>
 
    <!-- Search / Date filter -->
    <div style="padding:12px 24px;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap">
      <input id="sAttSearch" type="text" class="sat-search" placeholder="Search date…"/>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="sAttDateFrom" type="date" class="sat-date-input" title="From"/>
        <span style="color:var(--ink5);font-size:12px;font-weight:600">to</span>
        <input id="sAttDateTo" type="date" class="sat-date-input" title="To"/>
        <button id="sAttDateClear" class="sat-clear-btn">✕ Clear</button>
      </div>
    </div>
 
    <!-- Grid -->
    <div style="flex:1;overflow:auto;padding:0 24px 24px">
      <div id="sAttTableWrap">
        <div style="padding:48px;text-align:center;color:var(--ink5)">
          <div style="font-size:22px;margin-bottom:8px">⏳</div>Loading…
        </div>
      </div>
    </div>`;
}
 
// ── Core grid renderer ────────────────────────────────────────────────
 
function renderStudentGrid(records, subj) {
  const wrap = document.getElementById('sAttTableWrap');
  if (!wrap) return;
 
  // Store for filter re-use
  wrap._allRecords = records;
  wrap._subj = subj;
 
  _renderStudentGridFromRecords(records, subj);
}
 
function _renderStudentGridFromRecords(records, subj) {
  const wrap = document.getElementById('sAttTableWrap');
  if (!wrap) return;
 
  if (!records || records.length === 0) {
    wrap.innerHTML = `
      <div style="padding:64px 20px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">📋</div>
        <div style="font-size:14px;font-weight:700;color:var(--ink3)">No attendance records yet</div>
        <div style="font-size:12px;color:var(--ink5);margin-top:6px">
          Records appear here once your teacher marks attendance or you submit via passcode.
        </div>
      </div>`;
    return;
  }
 
  // ── Build date set ────────────────────────────────────────────────
  const dateSet = new Set();
  records.forEach(r => {
    // r.date is "YYYY-MM-DD" from server; fallback to marked_at/created_at
    const raw = r.date || r.marked_at || r.created_at;
    const display = studentToDisplayDate(new Date(raw + (r.date ? 'T00:00:00Z' : '')));
    if (display) dateSet.add(display);
  });
 
  const dates = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
 
  // ── Build lookup: dateDisplay → status ────────────────────────────
  const lookup = {};
  records.forEach(r => {
    const raw = r.date || r.marked_at || r.created_at;
    const display = studentToDisplayDate(new Date(raw + (r.date ? 'T00:00:00Z' : '')));
    if (display && !lookup[display]) lookup[display] = r.status;
  });
 
  // ── Column headers ────────────────────────────────────────────────
  const colHeaders = dates.map(d => {
    const { day, mon, year } = studentFmtColDate(d);
    return `
      <th class="sat-th-date">
        <div class="sat-th-date-inner">
          <div class="sat-th-date-mon">${mon}</div>
          <div class="sat-th-date-day">${day}</div>
          <div class="sat-th-date-year">${year}</div>
        </div>
      </th>`;
  }).join('');
 
  // ── Single student row (the logged-in student) ────────────────────
  // Compute per-date stats
  let p = 0, a = 0, l = 0;
  dates.forEach(d => {
    const s = lookup[d];
    if (s === 'present') p++;
    else if (s === 'absent') a++;
    else if (s === 'late') l++;
  });
  const total = p + a + l;
  const pct = total ? Math.round((p / total) * 100) : 0;
  const rateColor = pct >= 80 ? '#059669' : pct >= 60 ? '#d97706' : '#dc2626';
 
  const cells = dates.map(d => {
    const status = lookup[d] || null;
    const s = studentCellStyle(status);
    return `
      <td class="sat-td-cell">
        <div class="sat-cell-inner" style="background:${s.bg};color:${s.color}">
          ${s.label}
        </div>
      </td>`;
  }).join('');
 
  const legend = `
    <div class="sat-legend">
      <div class="sat-legend-item">
        <div class="sat-legend-dot" style="background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.3)"></div>
        <span>Present</span>
      </div>
      <div class="sat-legend-item">
        <div class="sat-legend-dot" style="background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3)"></div>
        <span>Absent</span>
      </div>
      <div class="sat-legend-item">
        <div class="sat-legend-dot" style="background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.3)"></div>
        <span>Late</span>
      </div>
      <div class="sat-legend-item">
        <div class="sat-legend-dot" style="background:rgba(139,92,246,.15);border-color:rgba(139,92,246,.3)"></div>
        <span>Excused</span>
      </div>
    </div>`;
 
  wrap.innerHTML = `
    ${legend}
    <div class="sat-table-wrap">
      <table id="sAttTable">
        <thead>
          <tr>
            <th class="sat-th-info">Session Info</th>
            <th class="sat-th-rate">My Rate</th>
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          <tr data-search="${dates.join(' ').toLowerCase()}">
            <td class="sat-td-info">
              <div class="sat-td-info-inner">
                <div style="width:36px;height:36px;border-radius:10px;
                            background:linear-gradient(135deg,${subj.color}33,${subj.color}11);
                            border:1.5px solid ${subj.color}44;
                            display:grid;place-items:center;flex-shrink:0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${subj.color}"
                       stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
                  </svg>
                </div>
                <div style="min-width:0">
                  <div style="font-size:12.5px;font-weight:700;color:var(--ink2);
                              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${escapeHTML(subj.name)}
                  </div>
                  <div style="font-size:10.5px;color:var(--ink5);margin-top:2px">
                    ${escapeHTML(subj.className || '')}
                  </div>
                </div>
              </div>
            </td>
            <td class="sat-td-rate">
              <div style="font-size:14px;font-weight:800;color:${rateColor};line-height:1">${pct}%</div>
              <div style="height:4px;border-radius:99px;background:rgba(15,23,42,.08);margin:5px 0;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${rateColor};border-radius:99px"></div>
              </div>
              <div style="font-size:9px;color:var(--ink5);font-weight:600">${p}P · ${a}A${l > 0 ? ` · ${l}L` : ''}</div>
            </td>
            ${cells}
          </tr>
        </tbody>
      </table>
    </div>
    <div style="text-align:center;padding:14px 0 0;font-size:11px;color:var(--ink5)">
      Showing ${dates.length} session${dates.length !== 1 ? 's' : ''} · ${SEMESTER_AY}
    </div>`;
}
 
// ── Filters ───────────────────────────────────────────────────────────
 
function applyStudentFilters() {
  const panel = document.getElementById('studentAttendancePanel');
  if (!panel) return;
 
  const wrap = document.getElementById('sAttTableWrap');
  if (!wrap || !wrap._allRecords) return;
 
  const query    = (document.getElementById('sAttSearch')?.value || '').toLowerCase();
  const dateFrom = document.getElementById('sAttDateFrom')?.value;
  const dateTo   = document.getElementById('sAttDateTo')?.value;
  const fromTs   = dateFrom ? new Date(dateFrom + 'T00:00:00Z').getTime() : null;
  const toTs     = dateTo   ? new Date(dateTo   + 'T23:59:59Z').getTime() : null;
 
  let records = wrap._allRecords;
 
  if (fromTs || toTs) {
    records = records.filter(r => {
      const raw = r.date || r.marked_at || r.created_at;
      const d   = new Date(raw + (r.date ? 'T00:00:00Z' : ''));
      const ts  = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (fromTs && ts < fromTs) return false;
      if (toTs   && ts > toTs)   return false;
      return true;
    });
  }
 
  _renderStudentGridFromRecords(records, wrap._subj);
 
  // Apply text search on column headers after render
  if (query) {
    document.querySelectorAll('#sAttTable thead th.sat-th-date').forEach(th => {
      const text = th.textContent.toLowerCase();
      const ci = th.cellIndex;
      th.style.opacity = text.includes(query) ? '1' : '0.25';
      // Dim corresponding body cells
      document.querySelectorAll(`#sAttTable tbody tr td:nth-child(${ci + 1})`).forEach(td => {
        td.style.opacity = text.includes(query) ? '1' : '0.25';
      });
    });
  }
}
 
// ── CSV export ────────────────────────────────────────────────────────
 
function exportStudentAttendanceCSV(subj, records) {
  if (!records || records.length === 0) {
    showToast('No records to export', 'error'); return;
  }
 
  // Same pivot as the grid
  const dateSet = new Set();
  records.forEach(r => {
    const raw = r.date || r.marked_at || r.created_at;
    const d = studentToDisplayDate(new Date(raw + (r.date ? 'T00:00:00Z' : '')));
    if (d) dateSet.add(d);
  });
  const dates = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
 
  const lookup = {};
  records.forEach(r => {
    const raw = r.date || r.marked_at || r.created_at;
    const d = studentToDisplayDate(new Date(raw + (r.date ? 'T00:00:00Z' : '')));
    if (d && !lookup[d]) lookup[d] = r.status;
  });
 
  let p = 0, a = 0, l = 0;
  const cells = dates.map(d => {
    const s = lookup[d];
    if (s === 'present') p++;
    else if (s === 'absent') a++;
    else if (s === 'late') l++;
    if (!s || s === 'na') return '—';
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  const total = p + a + l;
  const rate = total ? Math.round((p / total) * 100) + '%' : '—';
 
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
 
  const header = ['Subject', 'Class', ...dates, 'Present', 'Absent', 'Late', 'Rate'];
  const row    = [subj.name, subj.className || '', ...cells, p, a, l, rate];
 
  const csv = [header.map(esc).join(','), row.map(esc).join(',')].join('\n');
 
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a2 = document.createElement('a');
  a2.href = URL.createObjectURL(blob);
  a2.download = `${subj.name}_attendance.csv`.replace(/[^a-z0-9_\-\.]/gi, '_');
  document.body.appendChild(a2);
  a2.click();
  document.body.removeChild(a2);
  URL.revokeObjectURL(a2.href);
  showToast('CSV exported!', 'success');
}
 
// ── Patch showView to use new renderAttendanceView ────────────────────
// Replace the original showView call for 'attendanceView':
//   if(id==='attendanceView'){ renderSummaryChips(); renderSubjectLegend(); renderTable(); }
// With:
//   if(id==='attendanceView')  renderAttendanceView();
//
// Also expose openStudentAttendanceGrid globally
window.openStudentAttendanceGrid = openStudentAttendanceGrid;