import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'static')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'replace_with_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const isSupabaseConfigured = typeof supabaseUrl === 'string' && /https?:\/\//i.test(supabaseUrl) && typeof supabaseKey === 'string' && supabaseKey.length > 0 && !supabaseKey.includes('your-supabase-key');
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

function requireLogin(req, res, next) {
  if (!req.session.user) {
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
  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null, email: '' });
});

app.post('/login', requireSupabase, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('login', { error: 'Please fill in all fields.', email });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return res.render('login', { error: error?.message || 'Invalid credentials.', email });
  }

  const userMetadata = data.user.user_metadata || {};
  req.session.user = {
    id: data.user.id,
    email: data.user.email,
    role: userMetadata.role,
    name: userMetadata.name,
  };

  if (req.session.user.role === 'teacher') {
    return res.redirect('/teacherdashboard');
  }
  if (req.session.user.role === 'student') {
    return res.redirect('/studentdashboard');
  }

  return res.render('login', { error: 'User role not found.', email });
});

app.get('/register', (req, res) => {
  res.render('register', { error: null, form: {} });
});

app.post('/register', requireSupabase, async (req, res) => {
  const { email, password, confirm_password, fullname, user_type } = req.body;

  if (!email || !password || !confirm_password || !fullname || !user_type) {
    return res.render('register', {
      error: 'Please fill in all fields.',
      form: { email, fullname, user_type },
    });
  }

  if (password !== confirm_password) {
    return res.render('register', {
      error: 'Passwords do not match.',
      form: { email, fullname, user_type },
    });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: fullname,
        role: user_type,
      },
    },
  });

  if (error) {
    return res.render('register', {
      error: error.message,
      form: { email, fullname, user_type },
    });
  }

  return res.redirect('/login');
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

// API endpoints
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

    res.json({ success: true, class: data[0] });
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

    res.json({ classes: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Node attendance app running on http://localhost:${port}`);
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
