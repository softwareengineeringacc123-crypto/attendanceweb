
  import express from 'express';
  import session from 'express-session';
  import path from 'path';
  import { fileURLToPath } from 'url';
  import dotenv from 'dotenv';
  import { createClient } from '@supabase/supabase-js';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  dotenv.config({ path: path.join(__dirname, '.env') });

  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use('/static', express.static(path.join(__dirname, 'static')));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(
  session({
    secret: process.env.SESSION_SECRET || 'replace_with_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',   // ✅ required for same-origin POST requests
      secure: false,      // ✅ must be false for localhost (no HTTPS)
    },
  })
);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('--- SUPABASE CONFIGURATION DEBUG ---');
  console.log('Looking for .env file at:', path.join(__dirname, '.env'));
  console.log('SUPABASE_URL:', supabaseUrl ? 'Set (starts with ' + supabaseUrl.substring(0, 8) + ')' : 'Not Set');
  console.log('SUPABASE_KEY:', supabaseKey ? 'Set (length: ' + supabaseKey.length + ')' : 'Not Set');
  if (supabaseKey && supabaseKey.includes('your-supabase-key')) {
    console.log('ERROR: SUPABASE_KEY still contains the placeholder text "your-supabase-key".');
  }
  console.log('------------------------------------');

  const isSupabaseConfigured = typeof supabaseUrl === 'string' && /https?:\/\//i.test(supabaseUrl) && typeof supabaseKey === 'string' && supabaseKey.length > 0 && !supabaseKey.includes('your-supabase-key');
  const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;
  // Admin client uses service role key to bypass RLS
  const supabaseAdmin = (isSupabaseConfigured && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;
  function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized: Admins only' });
  }
  next();
}
  function requireLogin(req, res, next) {
  if (!req.session.user) {
    // ✅ API routes should return JSON, not redirect to login page
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.redirect('/login');
  }
  next();
}

  function requireSupabase(req, res, next) {
    if (!supabase) {
      return res.status(500).send(
        'Supabase is not configured. Please update node-app/.env with a valid SUPABASE_URL and SUPABASE_KEY.'
      );
    }
    next();
  }

  app.get('/', (req, res) => {
  if (req.session.user) {
    return redirectByRole(req, res);
  }
  return res.redirect('/login');
});

  // Login page — redirect away if already logged in
app.get('/login', (req, res) => {
  if (req.session.user) {
    return redirectByRole(req, res);
  }
  res.render('login', { error: null, email: '' });
});
 
// ── Helper: redirect to the right dashboard based on role ──────────────
function redirectByRole(req, res) {
  const role = req.session.user?.role;
  if (role === 'admin')   return res.redirect('/admin');
  if (role === 'teacher') return res.redirect('/teacherdashboard');
  if (role === 'student') return res.redirect('/studentdashboard');
  // Unknown role — clear session and go to login
  req.session.destroy(() => res.redirect('/login'));
}

  app.post('/login', requireSupabase, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('login', { error: 'Please fill in all fields.', email });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
  console.log('[LOGIN] user_metadata:', data?.user?.user_metadata);
  console.log('[LOGIN] app_metadata:', data?.user?.app_metadata);
  console.log('[LOGIN] role detected:', data?.user?.user_metadata?.role);
    if (error || !data.user) {
      return res.render('login', { error: error?.message || 'Invalid credentials.', email });
    }

    const userMetadata = data.user.user_metadata || {};
    req.session.user = {
      id: data.user.id,
      email: data.user.email,
      role: userMetadata.role,
      name: userMetadata.name,
      student_number: userMetadata.student_number,
    };

    if (req.session.user.role === 'admin') {
      return res.redirect('/admin');
    }
 
    // Students & teachers must be approved by admin before they can log in
    const registrationStatus = userMetadata.registration_status;
 
    if (registrationStatus !== 'approved') {
      req.session.destroy(() => {});
      const reason = registrationStatus === 'declined'
        ? 'Your registration was declined by the administrator. Please contact support.'
        : 'Your account is pending administrator approval. You will be notified once approved.';
      return res.render('login', { error: reason, email });
    }
 
    if (req.session.user.role === 'teacher') return res.redirect('/teacherdashboard');
    if (req.session.user.role === 'student') return res.redirect('/studentdashboard');
 
    return res.render('login', { error: 'User role not found.', email });
  });

  app.get('/register', (req, res) => {
    res.render('register', { error: null, form: { user_type: req.query.type || '' } });
  });

  app.post('/register', requireSupabase, async (req, res) => {
    const { email, password, confirm_password, lastname, firstname, student_number, user_type } = req.body;

    if (!email || !password || !confirm_password || !lastname || !firstname || !student_number || !user_type) {
      return res.render('register', {
        error: 'Please fill in all fields.',
        form: { email, lastname, firstname, student_number, user_type },
      });
    }

    if (password !== confirm_password) {
      return res.render('register', {
        error: 'Passwords do not match.',
        form: { email, lastname, firstname, student_number, user_type },
      });
    }

    const fullName = `${lastname}, ${firstname}`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: fullName,
          role: user_type,
          student_number: student_number,
        },
      },
    });

    if (error) {
      return res.render('register', {
        error: error.message,
        form: { email, lastname, firstname, student_number, user_type },
      });
    }

      return res.redirect('/login');
  });
 app.post('/api/check-email-verified', requireSupabase, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ verified: false });
    try {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const user = users.find(u => u.email === email);
        res.json({ verified: !!(user && user.email_confirmed_at) });
    } catch {
        res.json({ verified: false });
    }
});
// Supabase email confirmation callback
app.get('/auth/confirm', requireSupabase, async (req, res) => {
  const token_hash = req.query.token_hash;
  const type       = req.query.type;        // usually 'email'
  const next       = req.query.next || '/login';

  if (!token_hash || !type) {
    return res.redirect('/login?error=invalid_confirmation_link');
  }

  try {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (error) {
      console.error('[AUTH CONFIRM] OTP error:', error.message);
      return res.redirect('/login?error=' + encodeURIComponent(error.message));
    }

    // Confirmed — send them back to register page so the poll catches it
    // and shows the "Email Verified" state
    return res.redirect('/register?confirmed=1');
  } catch (err) {
    console.error('[AUTH CONFIRM] Unexpected error:', err.message);
    return res.redirect('/login?error=confirmation_failed');
  }
});
 
// Supabase clicks the confirmation link → lands here →
// shows "email confirmed, waiting for admin approval" page

// Add this route
  app.get('/admin', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  res.render('admin', { sessionUser: req.session.user });
  });
  app.get('/teacherdashboard', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.redirect('/login');
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', req.session.user.email)
      .limit(1);

    const user = Array.isArray(data) ? data[0] : null;
    res.render('teacherdashboard', { user, sessionUser: req.session.user });
  });

  app.get('/studentdashboard', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'student') {
      return res.redirect('/login');
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', req.session.user.email)
      .limit(1);

    const user = Array.isArray(data) ? data[0] : null;
    res.render('studentdashboard', { user, sessionUser: req.session.user });
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  // ── Admin API Endpoints ──────────────────────────────────────────────────────────
  
  // Get all students
app.get('/api/admin/students', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    const students = users
      .filter(u => u.user_metadata?.role === 'student')
      .map(u => ({
        id: u.user_metadata?.student_id || u.id.slice(0, 8).toUpperCase(),
        name: u.user_metadata?.name || u.email,
        email: u.email,
        course: u.user_metadata?.course || '',
        section: u.user_metadata?.section || '',
      }));

    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all teachers
app.get('/api/admin/teachers', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    const teachers = users
      .filter(u => u.user_metadata?.role === 'teacher')
      .map(u => ({
        id: u.user_metadata?.employee_id || u.id.slice(0, 8).toUpperCase(),
        name: u.user_metadata?.name || u.email,
        email: u.email,
        subject: u.user_metadata?.subject || u.user_metadata?.course || '',
      }));

    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/api/admin/users', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    const mapped = users
      .filter(u => ['student', 'teacher'].includes(u.user_metadata?.role))
      .map(u => {
        const isStudent = u.user_metadata?.role === 'student';
        return {
          id: u.user_metadata?.student_id || u.user_metadata?.employee_id || u.id.slice(0, 8).toUpperCase(),
          name: u.user_metadata?.name || u.email,
          email: u.email,
          role: u.user_metadata?.role,
          course: isStudent ? (u.user_metadata?.course || '') : '',
          subject: !isStudent ? (u.user_metadata?.subject || u.user_metadata?.course || '') : '',
          section: u.user_metadata?.section || '',
        };
      });

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/admin/registrations', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
 
    const pending = users
      .filter(u => {
        const meta   = u.user_metadata || {};
        const status = meta.registration_status;
        return (
          (meta.role === 'student' || meta.role === 'teacher') &&
          u.email_confirmed_at &&
          status !== 'approved' &&
          status !== 'declined'
        );
      })
      .map(u => ({
        id:         u.id,
        fullname:   u.user_metadata?.name    || u.email,
        email:      u.email,
        role:       u.user_metadata?.role    || 'student',
        course:     u.user_metadata?.course  || '',
        section:    u.user_metadata?.section || '',
        created_at: u.created_at,
      }));
 
    res.json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// Approve a registration
app.post('/api/admin/accept-registration/:userId', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { data: { user }, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(req.params.userId);
    if (fetchErr || !user) return res.status(404).json({ error: 'User not found' });
 
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.userId, {
      user_metadata: { ...user.user_metadata, registration_status: 'approved' },
    });
    if (error) throw error;
 
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// Decline a registration
// Decline a registration — DELETES the user entirely
app.post('/api/admin/decline-registration/:userId', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.userId);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
  // ── API endpoints ─────────────────────────────────────────────────────────────

  app.post('/api/add-class', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { class_name, subject, section, schedule, password, qr_data } = req.body;

    try {
      const { data, error } = await supabase
        .from('classes')
        .insert({
          class_name,
          subject,
          section,
          schedule,
          password,
          qr_data,
          teacher_id: req.session.user.id,
        })
        .select();

      if (error) throw error;

      res.json({ success: true, class: data[0], class_id: data[0].id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/teacher-classes', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', req.session.user.id);

      if (error) throw error;

      // Normalize subject IDs: convert float IDs to integers
      const normalizedClasses = (data || []).map(cls => ({
        ...cls,
        subjects: (cls.subjects || []).map(s => ({
          ...s,
          id: Math.trunc(Number(s.id))
        }))
      }));

      res.json({ classes: normalizedClasses });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add a single subject to a class
  app.post('/api/add-subject/:classId', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { classId } = req.params;
    const { subject, start_time, end_time, room, days } = req.body;

    try {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .eq('teacher_id', req.session.user.id)
        .single();

      if (classError || !classData) {
        return res.status(403).json({ error: 'Class not found or unauthorized' });
      }

      const subjects = classData.subjects || [];
      const newSubject = {
        id: Date.now(), // integer — safe for bigint comparison
        subject,
        start_time,
        end_time,
        room,
        days: days || 'TBD',
      };
      subjects.push(newSubject);

      const { data, error } = await supabase
        .from('classes')
        .update({ subjects })
        .eq('id', classId)
        .select();

      if (error) throw error;

      res.json({ success: true, subject: newSubject });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add multiple subjects to a class at once
  app.post('/api/add-subjects/:classId', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { classId } = req.params;
    const { subjects: incomingSubjects } = req.body;

    if (!Array.isArray(incomingSubjects)) {
      return res.status(400).json({ error: 'subjects must be an array' });
    }

    try {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .eq('teacher_id', req.session.user.id)
        .single();

      if (classError || !classData) {
        return res.status(403).json({ error: 'Class not found or unauthorized' });
      }

      let subjects = classData.subjects || [];

      // FIX: use Date.now() + index so subjects added in the same loop
      // call each get a unique integer ID (avoids collision when forEach
      // runs faster than 1 ms — which is always in practice).
      const base = Date.now();
      incomingSubjects.forEach((subj, i) => {
        subjects.push({
          id: base + i, // guaranteed unique integers within this batch
          subject: subj.subject,
          start_time: subj.start_time || '00:00',
          end_time: subj.end_time || '00:00',
          room: subj.room || 'TBD',
          days: subj.days || 'TBD',
        });
      });

      const { data, error } = await supabase
        .from('classes')
        .update({ subjects })
        .eq('id', classId)
        .select();

      if (error) throw error;

      res.json({ success: true, subjects });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get subjects for a class
  app.get('/api/class-subjects/:classId', requireLogin, requireSupabase, async (req, res) => {
    const { classId } = req.params;

    try {
      const { data: classData, error } = await supabase
        .from('classes')
        .select('subjects')
        .eq('id', classId)
        .single();

      if (error) throw error;

      // Normalize subject IDs: convert float IDs to integers
      const subjects = (classData?.subjects || []).map(s => ({
        ...s,
        id: Math.trunc(Number(s.id))
      }));

      res.json({ subjects });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  
 

  // Delete a subject from a class
  app.delete('/api/delete-class/:classId', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized: Only teachers can delete classes' });
  }

  const { classId } = req.params;

  try {
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('*')
      .eq('id', classId)
      .eq('teacher_id', req.session.user.id)
      .single();

    if (classError) return res.status(400).json({ error: 'Class not found: ' + classError.message });
    if (!classData) return res.status(403).json({ error: 'Class not found or unauthorized access' });

    const { error: deleteError } = await supabase
      .from('classes')
      .delete()
      .eq('id', classId)
      .eq('teacher_id', req.session.user.id);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete class: ' + error.message });
  }
});

  app.post('/api/start-attendance-session', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { class_name, session_password, class_id, subject_id, duration } = req.body;

    if (!class_name) {
      return res.status(400).json({ error: 'Class name is required' });
    }

    try {
      const expiresAt = duration && duration > 0 ? new Date(Date.now() + duration * 60000).toISOString() : null;

      const { data, error } = await supabase
        .from('attendance_sessions')
        .insert({
          teacher_id: req.session.user.id,
          class_name,
          class_id: class_id ? Number(class_id) : null,
          subject_id: subject_id ? Number(subject_id) : null,
          session_password: session_password || null,
          expires_at: expiresAt
        })
        .select();

      if (error) throw error;

      res.json({ success: true, session: data[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
app.patch('/api/attendance-sessions/:sessionId/stop', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Get the session to find its class_id
    const { data: session, error: fetchErr } = await supabase
      .from('attendance_sessions')
      .select('class_id')
      .eq('id', req.params.sessionId)
      .eq('teacher_id', req.session.user.id)
      .single();

    // 2. Mark session inactive
    const { error } = await supabase
      .from('attendance_sessions')
      .update({ is_active: false })
      .eq('id', req.params.sessionId)
      .eq('teacher_id', req.session.user.id);

    if (error) throw error;

    // 3. Clear the password from the class
    if (session?.class_id) {
      await (supabaseAdmin || supabase)
        .from('classes')
        .update({ password: null })
        .eq('id', session.class_id)
        .eq('teacher_id', req.session.user.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
  app.get('/api/attendance-sessions', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      const { data, error } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('teacher_id', req.session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({ sessions: data || [] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });


// PATCH /api/attendance/:recordId  — update status of an attendance record
app.patch('/api/attendance/:recordId', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { recordId } = req.params;
  const { status }   = req.body;

  const allowed = ['present', 'absent', 'late'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be present, absent, or late.' });
  }

  try {
    // Verify the record belongs to a class owned by this teacher
    const { data: record, error: recErr } = await supabase
      .from('attendance')
      .select('id, class_id')
      .eq('id', recordId)
      .single();

    if (recErr || !record) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Confirm teacher owns the class
    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('id')
      .eq('id', record.class_id)
      .eq('teacher_id', req.session.user.id)
      .single();

    if (clsErr || !cls) {
      return res.status(403).json({ error: 'Not authorized to edit this record' });
    }

    // Perform the update
    const { error: updateErr } = await (supabaseAdmin || supabase)
      .from('attendance')
      .update({ status })
      .eq('id', recordId);

    if (updateErr) throw updateErr;

    res.json({ success: true, id: recordId, status });
  } catch (err) {
    console.error('[ATTENDANCE PATCH] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
  // ── Data fetching endpoints ───────────────────────────────────────────────────

  app.get('/api/user-profile', requireLogin, requireSupabase, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', req.session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      const profile = data || {
        id: req.session.user.id,
        name: req.session.user.name || 'User',
        role: req.session.user.role || 'student',
        department: null,
        section: null,
      };

      // Siguraduhing ma-fetch ang registered email kahit wala pa ito sa profiles table
      if (!profile.email) {
        profile.email = req.session.user.email;
      }

      // Get student_number from auth metadata if not in profile
      if (!profile.student_number && req.session.user.student_number) {
        profile.student_number = req.session.user.student_number;
      }

      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/update-profile', requireLogin, requireSupabase, async (req, res) => {
    const { name, department, section } = req.body;
    const client = supabaseAdmin || supabase; // Bypass RLS gamit ang admin key kung available

    try {
      // Update ang profiles table na direktang nagha-handle sa display ng dashboard
      const { error: profileErr } = await client
        .from('profiles')
        .upsert({
          id: req.session.user.id,
          name: name,
          department: department
        }, { onConflict: 'id' });

      if (profileErr) throw new Error('Database Error: ' + profileErr.message);

      // I-update din ang 'users' table dahil may mga bahagi ng app na naka-depende rito
      if (req.session.user.email) {
        await client.from('users').update({ name: name, course: department, section: section }).eq('email', req.session.user.email);
      }

      // Kung available ang service_role (supabaseAdmin), i-update na rin pati sa main auth credentials
      if (supabaseAdmin) {
        const { data: userResp } = await supabaseAdmin.auth.admin.getUserById(req.session.user.id);
        if (userResp && userResp.user) {
          const currentMeta = userResp.user.user_metadata || {};
          await supabaseAdmin.auth.admin.updateUserById(req.session.user.id, {
            user_metadata: { ...currentMeta, name: name, course: department, section: section }
          });
        }
      }
      req.session.user.name = name;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/user-subjects', requireLogin, requireSupabase, async (req, res) => {
    try {
      let query;

      if (req.session.user.role === 'teacher') {
        query = supabase.from('classes').select('*').eq('teacher_id', req.session.user.id);
      } else {
        query = supabase.from('classes').select('*');
      }

      const { data, error } = await query;
      if (error) throw error;

      res.json({ subjects: data || [] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/user-attendance', requireLogin, requireSupabase, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', req.session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({ attendance: data || [] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/notifications', requireLogin, requireSupabase, async (req, res) => {
    try {
      const client = supabaseAdmin || supabase;

      const { data: attendance, error: attendanceError } = await client
        .from('attendance')
        .select('status')
        .eq('student_id', req.session.user.id);

      if (attendanceError) throw attendanceError;

      const notifications = [];
      let notifId = 1;
      const totalRecords = attendance.length;
      const absentCount = attendance.filter(a => a.status === 'absent').length;
      const attendanceRate = totalRecords
        ? Math.round((attendance.filter(a => a.status === 'present').length / totalRecords) * 100)
        : 0;

      // Only show warning if they actually have attendance records
      if (totalRecords > 0 && attendanceRate < 80) {
        notifications.push({
          id: notifId++,
          title: 'Attendance Warning',
          text: `Your attendance is currently at ${attendanceRate}%. Please attend your classes.`,
          time: 'Today',
          unread: true,
          color: 'var(--amber)',
          bg: 'var(--amber-pale)',
        });
      }

      if (absentCount > 5) {
        notifications.push({
          id: notifId++,
          title: 'High Absence Count',
          text: `You have ${absentCount} absences. Consider contacting your instructor.`,
          time: 'Today',
          unread: true,
          color: 'var(--red)',
          bg: 'var(--red-pale)',
        });
      }

      // Pending enrollments & Today's Schedule
      const { data: enrollments } = await client
        .from('student_enrollments')
        .select('class_id, subject_id, status')
        .eq('student_id', req.session.user.id);

      if (enrollments) {
        const pendingCount = enrollments.filter(e => e.status === 'pending').length;
        if (pendingCount > 0) {
          notifications.push({
            id: notifId++,
            title: 'Pending Approvals',
            text: `You have ${pendingCount} subject request(s) waiting for teacher approval.`,
            time: 'Just now',
            unread: true,
            color: '#8B5CF6', 
            bg: 'rgba(139, 92, 246, 0.1)' // Purple theme for pending
          });
        }

        const approved = enrollments.filter(e => e.status === 'approved');
        if (approved.length > 0) {
          const classIds = [...new Set(approved.map(e => e.class_id))];
          const { data: classes } = await client
            .from('classes')
            .select('id, subjects')
            .in('id', classIds);

          if (classes) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const todayStr = dayNames[new Date().getDay()];
            let todayCount = 0;
            const approvedSubjectNames = [];

            classes.forEach(cls => {
              const enrolledSubjectIds = approved
                .filter(e => e.class_id === cls.id)
                .map(e => Math.trunc(Number(e.subject_id)));
              
              (cls.subjects || []).forEach(sub => {
                if (enrolledSubjectIds.includes(Math.trunc(Number(sub.id)))) {
                  approvedSubjectNames.push(sub.subject || 'Unknown Subject');
                  const daysArr = Array.isArray(sub.days) ? sub.days : (sub.days ? sub.days.split(',').map(d => d.trim()) : []);
                  if (daysArr.includes(todayStr)) {
                    todayCount++;
                  }
                }
              });
            });

            if (todayCount > 0) {
              notifications.push({
                id: notifId++,
                title: "Today's Schedule",
                text: `You have ${todayCount} class${todayCount > 1 ? 'es' : ''} scheduled for today. Have a great day!`,
                time: 'Today',
                unread: false,
                color: '#4361EE',
                bg: 'rgba(67, 97, 238, 0.1)' // Blue theme for schedule
              });
            }

            if (approvedSubjectNames.length > 0) {
              const subjList = approvedSubjectNames.length > 2 
                ? `${approvedSubjectNames[0]}, ${approvedSubjectNames[1]} and ${approvedSubjectNames.length - 2} other(s)`
                : approvedSubjectNames.join(' and ');

              notifications.push({
                id: notifId++,
                title: 'Enrollment Approved',
                text: `You have been accepted to ${subjList}.`,
                time: 'Active',
                unread: false,
                color: '#10B981', // Green theme for accepted enrollment
                bg: 'rgba(16, 185, 129, 0.1)' 
              });
            }
          }
        }
      }

      res.json({ notifications });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/update-passcode/:classId', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { classId } = req.params;
    const { passcode, duration } = req.body;

    console.log(`[PASSCODE UPDATE] Class ${classId}, Passcode: ${passcode}, Duration: ${duration}`);

    try {
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('id')
        .eq('id', classId)
        .eq('teacher_id', req.session.user.id)
        .single();

      if (clsErr || !cls) {
        return res.status(403).json({ error: 'Class not found or unauthorized' });
      }

      const updateData = (passcode === null || passcode === undefined)
        ? { password: null }
        : { password: passcode };

      const { data, error } = await supabase
        .from('classes')
        .update(updateData)
        .eq('id', classId)
        .eq('teacher_id', req.session.user.id);

      if (error) throw error;

      console.log(`[PASSCODE UPDATE] Success`);
      res.json({ success: true });
    } catch (err) {
      console.error(`[PASSCODE UPDATE] Error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // FIX: no longer passes float subjectId to Postgres bigint column.
  // Fetches all attendance for the class, then filters in JS using Math.trunc
  // on both sides so old float IDs (e.g. 1776836143093.8916) still match.
  app.get('/api/subject-attendance/:classId/:subjectId', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { classId } = req.params;
    const subjectIdInt = Math.trunc(parseFloat(req.params.subjectId));

    if (isNaN(subjectIdInt)) {
      return res.status(400).json({ error: 'Invalid subjectId' });
    }

    try {
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('id')
        .eq('id', classId)
        .eq('teacher_id', req.session.user.id)
        .single();

      if (clsErr || !cls) return res.status(403).json({ error: 'Class not found or unauthorized' });

      // Fetch all attendance for this class — avoid .eq('subject_id', floatString)
      // which causes a Postgres bigint cast error.
     const { data: allAttendance, error: attError } = await supabase
      .from('attendance')
      .select('id, student_name, student_email, status, marked_at, created_at, class_id, subject_id')
      .eq('class_id', classId)
      .order('marked_at', { ascending: false, nullsFirst: false });

      if (attError) throw attError;

      // Filter in JS: truncate both sides to match old float IDs and new integer IDs
      const records = (allAttendance || []).filter(r =>
        Math.trunc(Number(r.subject_id)) === subjectIdInt
      );

      console.log(`[ATTENDANCE] class=${classId} subjectInt=${subjectIdInt} → ${records.length}/${allAttendance?.length || 0} matched`);
      res.json({ records });
    } catch (err) {
      console.error('[ATTENDANCE] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── STUDENT ENROLLMENT ENDPOINTS ──────────────────────────────────────────

  app.get('/api/search-subject', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'student') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { code } = req.query;
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({ error: 'Enrollment code required' });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { data: allClasses, error: classError } = await client
      .from('classes')
      .select('id, class_name, teacher_id, subjects')
      .order('created_at', { ascending: false });

    if (classError) throw classError;

    // Collect unique teacher IDs then fetch their names in one query
    // Collect unique teacher IDs then fetch their names from auth metadata
const teacherIds = [...new Set((allClasses || []).map(c => c.teacher_id).filter(Boolean))];
let teacherMap = {};

if (teacherIds.length > 0) {
  const adminClient = supabaseAdmin || supabase;
  const { data: { users }, error: usersError } = adminClient.auth.admin ? await adminClient.auth.admin.listUsers() : { data: { users: [] }, error: null };
  
  // TEMP DEBUG — remove after confirming
  console.log('[TEACHER LOOKUP] usersError:', usersError);
  console.log('[TEACHER LOOKUP] total users fetched:', users?.length);
  console.log('[TEACHER LOOKUP] teacherIds to match:', teacherIds);
  console.log('[TEACHER LOOKUP] matched users:', users?.filter(u => teacherIds.includes(u.id)).map(u => ({ id: u.id, name: u.user_metadata?.name })));

  if (!usersError && users) {
    users
      .filter(u => teacherIds.includes(u.id))
      .forEach(u => {
        teacherMap[u.id] = u.user_metadata?.name || u.email || 'Unknown Teacher';
      });
  }
}

    const results = [];
    const searchTerm = code.toLowerCase().trim();
    const searchTermNoHyphen = searchTerm.replace(/-/g, '');

    if (allClasses && Array.isArray(allClasses)) {
      for (const cls of allClasses) {
        const subjects = cls.subjects || [];
        const teacherName = teacherMap[cls.teacher_id] || 'Unknown Teacher';

        const classNameMatch = cls.class_name.toLowerCase().includes(searchTerm);
        const classIdMatch = String(cls.id).includes(searchTerm);

        if (classNameMatch || classIdMatch) {
          results.push({
            classId: cls.id,
            className: cls.class_name,
            teacherName,
            subjects,
          });
          continue;
        }

        const matchedSubjects = subjects.filter(s => {
          const enrollCode = generateEnrollmentCode(s.id).toLowerCase();
          const enrollCodeNoHyphen = enrollCode.replace(/-/g, '');
          const subjectNameMatch = s.subject && s.subject.toLowerCase().includes(searchTerm);
          const codeMatch = enrollCode.includes(searchTerm) || enrollCodeNoHyphen.includes(searchTermNoHyphen);
          const idMatch = String(s.id).includes(searchTerm);
          return subjectNameMatch || codeMatch || idMatch;
        });

        if (matchedSubjects.length > 0) {
          results.push({
            classId: cls.id,
            className: cls.class_name,
            teacherName,
            subjects: matchedSubjects,
          });
        }
      }
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'No classes found matching your search' });
    }

    res.json({ results });
  } catch (err) {
    console.error('[SEARCH] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/drop-subject', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'student') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const classId = req.query.classId;
  const subjectId = req.query.subjectId;

  if (!classId || subjectId === undefined) {
    return res.status(400).json({ error: 'Class ID and Subject ID required' });
  }

  try {
    const client = supabaseAdmin || supabase;
    const cleanSubjectId = Math.trunc(Number(subjectId));
    const cleanClassId = Math.trunc(Number(classId));

    const { error } = await client
      .from('student_enrollments')
      .delete()
      .eq('student_id', req.session.user.id)
      .eq('class_id', cleanClassId)
      .eq('subject_id', cleanSubjectId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('[DROP SUBJECT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
  app.post('/api/enroll-subject', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'student') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { classId, subjectId } = req.body;
    if (!classId || !subjectId) {
      return res.status(400).json({ error: 'Class ID and Subject ID required' });
    }

    try {
      const client = supabaseAdmin || supabase;
      const cleanSubjectId = Math.trunc(Number(subjectId));
      const cleanClassId = Math.trunc(Number(classId));

      // Check if student is already enrolled
      const { data: existing, error: existingError } = await client
        .from('student_enrollments')
        .select('id, status')
        .eq('student_id', req.session.user.id)
        .eq('class_id', cleanClassId)
        .eq('subject_id', cleanSubjectId)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'pending') {
          return res.status(400).json({ error: 'Enrollment request already pending' });
        }
        return res.status(400).json({ error: 'Already enrolled in this subject' });
      }

      // Insert enrollment record
      const { data, error } = await client
        .from('student_enrollments')
        .insert({
          student_id: req.session.user.id,
          student_email: req.session.user.email,
          student_name: req.session.user.name || 'Student',
          class_id: cleanClassId,
          subject_id: cleanSubjectId,
          status: 'pending'
        })
        .select();

      if (error) throw error;

      res.json({ success: true });
    } catch (err) {
      console.error('[ENROLL] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/student-subjects', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'student') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      const client = supabaseAdmin || supabase;

      // Get all student enrollments with class info
      const { data: allEnrollments, error: enrollError } = await client
        .from('student_enrollments')
        .select('class_id, subject_id, status')
        .eq('student_id', req.session.user.id);

      if (enrollError) throw enrollError;

      if (!allEnrollments || allEnrollments.length === 0) {  
        return res.json({ subjects: [], classes: {}, pending: [] });
      }
      
      const enrollments = allEnrollments.filter(e => e.status === 'approved');
      const pendingList = allEnrollments.filter(e => e.status === 'pending').map(e => ({ classId: e.class_id, subjectId: e.subject_id }));

      // Get unique class IDs
      const classIds = [...new Set(enrollments.map(e => e.class_id))];

      // Fetch all classes
      const { data: classes, error: classError } = await client
        .from('classes')
        .select('id, class_name, subjects')
        .in('id', classIds);

      if (classError) throw classError;

      // Build response with subject details
      const classMap = {};
      const subjects = [];
      if (classes && Array.isArray(classes)) {
        for (const cls of classes) {
          classMap[cls.id] = { id: cls.id, name: cls.class_name };
          
          const clsSubjects = cls.subjects || [];
          for (const enrollment of enrollments.filter(e => e.class_id === cls.id)) {
            const subject = clsSubjects.find(s => Math.trunc(Number(s.id)) === Math.trunc(Number(enrollment.subject_id)));
            if (subject) {
              // Build the combined time string getSubjectTimeRange() expects
              const timeStr = (subject.start_time && subject.end_time)
                ? `${subject.start_time}–${subject.end_time}`
                : null;

              // Normalize days: DB stores "Mon, Tue" string — frontend needs array
              const daysArr = subject.days
                ? subject.days.split(',').map(d => d.trim()).filter(Boolean)
                : [];

              subjects.push({
                id:        Math.trunc(Number(subject.id)),
                name:      subject.subject,         // frontend uses .name
                time:      timeStr,                 // frontend uses .time
                room:      subject.room  || 'TBA',
                teacher:   subject.teacher || 'TBA',
                color:     subject.color || '#4361EE',
                days:      daysArr,                 // frontend uses .days as array
                classId:   cls.id,
                className: cls.class_name,
              });
            }
          }
        }
      }

      res.json({ subjects, classes: classMap, pending: pendingList });
    } catch (err) {
      console.error('[STUDENT SUBJECTS] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── TEACHER APPROVAL ENDPOINTS ──────────────────────────────────────────────────
  app.get('/api/pending-enrollments', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') return res.status(403).json({ error: 'Unauthorized' });
    try {
      const client = supabaseAdmin || supabase;
      const { data: classes } = await client.from('classes').select('id, class_name, subjects').eq('teacher_id', req.session.user.id);
      if (!classes || classes.length === 0) return res.json({ requests: [] });
      
      const classIds = classes.map(c => c.id);
      const { data: requests, error } = await client
        .from('student_enrollments')
        .select('*')
        .in('class_id', classIds)
        .eq('status', 'pending');
        
      if (error) throw error;

      const enriched = requests.map(req => {
         const cls = classes.find(c => c.id === req.class_id);
         const subj = (cls?.subjects || []).find(s => Math.trunc(Number(s.id)) === Math.trunc(Number(req.subject_id)));
         return {
           ...req,
           class_name: cls?.class_name || 'Unknown Class',
           subject_name: subj?.subject || 'Unknown Subject'
         };
      });
      res.json({ requests: enriched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/handle-enrollment', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') return res.status(403).json({ error: 'Unauthorized' });
    const { enrollment_id, action } = req.body;
    try {
       const client = supabaseAdmin || supabase;
       if (action === 'approve') {
         await client.from('student_enrollments').update({ status: 'approved' }).eq('id', enrollment_id);
       } else {
         await client.from('student_enrollments').delete().eq('id', enrollment_id);
       }
       res.json({ success: true });
    } catch(err) {
       res.status(500).json({ error: err.message });
    }
  });

  function generateEnrollmentCode(subjectId) {
    const code = (Math.abs(subjectId) % 999999).toString().padStart(6, '0');
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  }

  app.delete('/api/delete-subject/:classId/:subjectId', requireLogin, requireSupabase, async (req, res) => {
    if (req.session.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Unauthorized: Only teachers can delete subjects' });
    }

    const { classId, subjectId } = req.params;

    try {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .eq('teacher_id', req.session.user.id)
        .single();

      if (classError) return res.status(400).json({ error: 'Class not found: ' + classError.message });
      if (!classData) return res.status(403).json({ error: 'Class not found or unauthorized access' });

      const subjects = classData.subjects || [];
      const subjectIdInt = Math.trunc(parseFloat(subjectId));
      const updatedSubjects = subjects.filter(s => Math.trunc(Number(s.id)) !== subjectIdInt);

      if (updatedSubjects.length === subjects.length) {
        return res.status(404).json({ error: 'Subject not found in class' });
      }

      const { error: updateError } = await supabase
        .from('classes')
        .update({ subjects: updatedSubjects })
        .eq('id', classId)
        .eq('teacher_id', req.session.user.id);

      if (updateError) throw updateError;

      res.json({ success: true, message: 'Subject deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete subject: ' + error.message });
    }
  });

  // TEMP DEBUG
  app.get('/api/debug-routes', (req, res) => {
    const routes = [];
    app._router.stack.forEach(r => {
      if (r.route) routes.push(Object.keys(r.route.methods)[0].toUpperCase() + ' ' + r.route.path);
    });
    res.json(routes);
  });
app.post('/api/submit-attendance', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'student') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { classId, subjectId, passcode } = req.body;
  if (!classId || !subjectId) {
    return res.status(400).json({ error: 'Class ID and Subject ID required' });
  }

  const subjectIdInt = Math.trunc(Number(subjectId));

  try {
   
    const { data: classData, error: classError } = await supabaseAdmin
      .from('classes')
      .select('id, class_name, password, subjects')
      .eq('id', classId)
      .single();

    if (classError || !classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Passcode check against classes.password only
    // If password is null/empty, block entry entirely
    if (!classData.password) {
      return res.status(401).json({ error: 'No active attendance session. Please wait for your teacher to start one.' });
    }

    // If password exists but student entered wrong one, warn them
    const enteredPasscode = (passcode || '').trim();
      if (enteredPasscode !== classData.password.trim()) {
        return res.status(401).json({ error: 'Incorrect passcode. Please try again.' });
      }

    // — Find the subject details
    const subject = (classData.subjects || []).find(
      s => Math.trunc(Number(s.id)) === subjectIdInt
    );
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found in class' });
    }

    // — Duplicate check (already submitted today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: existing } = await supabaseAdmin
      .from('attendance')
      .select('id, status')
      .eq('student_id', req.session.user.id)
      .eq('class_id', classId)
      .eq('subject_id', subjectIdInt)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString())
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: 'Attendance already recorded today',
        status: existing.status
      });
    }

    //  Insert attendance record as present only
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = dayNames[now.getDay()];

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .insert({
        student_id:    req.session.user.id,
        student_name:  req.session.user.name,
        student_email: req.session.user.email,
        class_id:      classId,
        subject_id:    subjectIdInt,
        status:        'present',
        date:          today,
        dow,
        marked_at: now.toISOString(),
        time:          subject.start_time && subject.end_time
                         ? `${subject.start_time}–${subject.end_time}`
                         : '',
        room:          subject.room || 'TBA',
      })
      .select();

    if (error) throw error;

    res.json({ success: true, status: 'present' });

  } catch (err) {
    console.error('[SUBMIT ATTENDANCE] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// GET /api/admin/classes — all classes with subjects (admin only)
app.get('/api/admin/classes', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { data: classes, error } = await supabaseAdmin
      .from('classes')
      .select('id, class_name, teacher_id, subjects')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalized = (classes || []).map(cls => ({
      ...cls,
      subjects: (cls.subjects || []).map(s => ({
        ...s,
        id: Math.trunc(Number(s.id))
      }))
    }));

    res.json({ classes: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/attendance-logs — all attendance records (admin only)
app.get('/api/admin/attendance-logs', requireLogin, requireAdmin, requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .select('id, student_name, student_email, status, created_at, date, time, class_id, subject_id, room')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Enrich with class/subject names
    const classIds = [...new Set((data || []).map(r => r.class_id).filter(Boolean))];
    let classMap = {};

    if (classIds.length > 0) {
      const { data: classes } = await supabaseAdmin
        .from('classes')
        .select('id, class_name, subjects')
        .in('id', classIds);

      (classes || []).forEach(cls => { classMap[cls.id] = cls; });
    }

    const logs = (data || []).map(r => {
      const cls = classMap[r.class_id];
      const subj = (cls?.subjects || []).find(
        s => Math.trunc(Number(s.id)) === Math.trunc(Number(r.subject_id))
      );
      return {
        id:           r.id,
        date:         r.date || r.created_at,
        student_name: r.student_name || r.student_email || 'Unknown',
        time:         r.time || '—',
        subject:      subj?.subject || cls?.class_name || 'Unknown Subject',
        period:       subj?.days    || '—',
        status:       r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : 'Unknown',
        room:         r.room  || '—',
      };
    });

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// POST /api/attendance/import — insert a single attendance record (teacher import)
app.post('/api/attendance/import', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { classId, subjectId, studentName, studentEmail, date, status, room, startTime, endTime } = req.body;

  if (!classId || !subjectId || !studentName || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const allowed = ['present', 'absent', 'late'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Verify teacher owns the class
    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('teacher_id', req.session.user.id)
      .single();

    if (clsErr || !cls) {
      return res.status(403).json({ error: 'Class not found or unauthorized' });
    }

    // Parse the date string — fall back to today if missing/invalid
    const parsedDate = date ? new Date(date) : new Date();
    const validDate = !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
    const isoDate = validDate.toISOString();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dow = dayNames[validDate.getDay()];

    // Build time string from start/end if provided
    const timeStr = (startTime && endTime)
      ? `${startTime}–${endTime}`
      : (startTime || '');
    console.log('[IMPORT DEBUG] isoDate:', isoDate, '| parsedDate:', validDate, '| raw date input:', date);
    const { data, error } = await (supabaseAdmin || supabase)
      .from('attendance')
      .insert({
        student_id:     null,
        student_name:  studentName,
        student_email: studentEmail || null,
        class_id:      classId,
        subject_id:    Math.trunc(Number(subjectId)),
        status,
        date:          isoDate.split('T')[0],
        marked_at:     isoDate,
        dow, 
        room:          room || null,
        time:          timeStr || null,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, record: data });
  } catch (err) {
    console.error('[IMPORT INSERT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// PATCH /api/attendance/update-student — bulk update name/email on attendance rows
app.patch('/api/attendance/update-student', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { origEmail, newName, newEmail, recordIds } = req.body;
  if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
    return res.status(400).json({ error: 'recordIds required' });
  }

  try {
    const client = supabaseAdmin || supabase;

    // Verify all records belong to classes owned by this teacher
    const { data: records, error: fetchErr } = await client
      .from('attendance')
      .select('id, class_id')
      .in('id', recordIds);

    if (fetchErr) throw fetchErr;

    const classIds = [...new Set(records.map(r => r.class_id))];
    const { data: classes, error: clsErr } = await client
      .from('classes')
      .select('id')
      .in('id', classIds)
      .eq('teacher_id', req.session.user.id);

    if (clsErr) throw clsErr;

    const ownedClassIds = new Set(classes.map(c => c.id));
    const authorizedIds = records
      .filter(r => ownedClassIds.has(r.class_id))
      .map(r => r.id);

    if (authorizedIds.length === 0) {
      return res.status(403).json({ error: 'Not authorized to edit these records' });
    }

    // Build update payload
    const updatePayload = { student_name: newName };
    if (newEmail) {
      updatePayload.student_email = newEmail;
      // Only update student_id if it looks like an import placeholder or matches origEmail
      if (!origEmail || origEmail.startsWith('import_') || origEmail === '') {
        updatePayload.student_email = newEmail;
      }
    }

    const { error: updateErr } = await client
      .from('attendance')
      .update(updatePayload)
      .in('id', authorizedIds);

    if (updateErr) throw updateErr;

    res.json({ success: true, updated: authorizedIds.length });
  } catch (err) {
    console.error('[UPDATE STUDENT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// GET /api/enrolled-students/:classId/:subjectId
// Returns all approved enrolled students for a subject (for the link dropdown)
app.get('/api/enrolled-students/:classId/:subjectId', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { classId, subjectId } = req.params;
  const subjectIdInt = Math.trunc(Number(subjectId));

  try {
    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('teacher_id', req.session.user.id)
      .single();

    if (clsErr || !cls) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const client = supabaseAdmin || supabase;

    // Get approved enrollments for this specific subject
    const { data: enrollments, error: enrollErr } = await client
      .from('student_enrollments')
      .select('student_id, student_name, student_email')
      .eq('class_id', classId)
      .eq('subject_id', subjectIdInt)
      .eq('status', 'approved');

    if (enrollErr) throw enrollErr;

    // Deduplicate by student_id — keep first occurrence only
    const seen = new Set();
    const students = (enrollments || [])
      .filter(e => {
        if (!e.student_email || seen.has(e.student_id)) return false;
        seen.add(e.student_id);
        return true;
      })
      .map(e => ({
        name:  e.student_name  || e.student_email,
        email: e.student_email,
        id:    e.student_id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ students });
  } catch (err) {
    console.error('[ENROLLED STUDENTS] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/attendance/:recordId', requireLogin, requireSupabase, async (req, res) => {
  if (req.session.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { recordId } = req.params;

  try {
    // Verify the record belongs to a class owned by this teacher
    const { data: record, error: recErr } = await supabase
      .from('attendance')
      .select('id, class_id')
      .eq('id', recordId)
      .single();

    if (recErr || !record) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('id')
      .eq('id', record.class_id)
      .eq('teacher_id', req.session.user.id)
      .single();

    if (clsErr || !cls) {
      return res.status(403).json({ error: 'Not authorized to delete this record' });
    }

    const { error: deleteErr } = await (supabaseAdmin || supabase)
      .from('attendance')
      .delete()
      .eq('id', recordId);

    if (deleteErr) throw deleteErr;

    res.json({ success: true });
  } catch (err) {
    console.error('[ATTENDANCE DELETE] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
  const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  function startServer(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Node attendance app running on http://0.0.0.0:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is already in use. Trying port ${port + 1}...`);
      startServer(port + 1);
      return;
    }
    console.error('Server error:', err);
    process.exit(1);
  });
} 
  startServer(DEFAULT_PORT); 