// Teacher Dashboard JavaScript

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
  if (!list) return;

  if (TEACHER_CLASSES.length === 0) {
    list.innerHTML = '<div class="class-item" style="cursor:default">No classes yet. Create one to begin.</div>';
    selectedTeacherClass = null;
    updateSelectedClassCard();
    return;
  }

  list.innerHTML = TEACHER_CLASSES.map(cls => `
    <div class="class-item${selectedTeacherClass && selectedTeacherClass.id === cls.id ? ' active' : ''}" onclick="selectTeacherClass('${cls.id}')">
      <div style="font-weight:700">${cls.class_name || 'Untitled'}</div>
      <div style="font-size:12px;color:var(--ink4);margin-top:4px">${cls.subject || 'No subject'}</div>
    </div>
  `).join('');

  if (!selectedTeacherClass) {
    selectedTeacherClass = TEACHER_CLASSES[0];
  }
  updateSelectedClassCard();
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

function submitClassForm() {
  const name = document.getElementById('classNameInput')?.value.trim();
  const subject = document.getElementById('classSubjectInput')?.value.trim();
  const section = document.getElementById('classSectionInput')?.value.trim();
  const days = ['mon','tue','wed','thu','fri','sat','sun'].filter(d => document.getElementById(d).checked).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join('/');
  const time = document.getElementById('classTimeInput')?.value.trim();
  const schedule = days + (time ? ' ' + time : '');
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
      ['mon','tue','wed','thu','fri','sat','sun'].forEach(d => document.getElementById(d).checked = false);
      document.getElementById('classTimeInput').value = '';
      document.getElementById('classPasswordInput').value = '';
      document.getElementById('classQRInput').value = '';
      fetchTeacherClasses();
    })
    .catch(err => alert(`Error saving class: ${err.message}`));
}

function fetchTeacherClasses() {
  fetch('/api/teacher-classes')
    .then(res => res.json())
    .then(data => {
      TEACHER_CLASSES = data.classes || [];
      renderTeacherClasses();
    })
    .catch(err => console.error('Error fetching classes:', err));
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  fetchTeacherClasses();
});