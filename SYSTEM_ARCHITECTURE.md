# Website Attendance System - Architecture & Database Analysis

## 🔗 System Connection Overview

### Architecture Stack
- **Backend**: Express.js (Node.js)
- **Frontend**: EJS Templates + Vanilla JavaScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Session Management**: express-session

### Connection Flow
```
Browser → EJS Views (HTML/CSS/JS) → API Endpoints (Express) → Supabase → PostgreSQL
```

---

## 📊 Database Tables & Queries

### 1. **Users Table**
**Purpose**: Store user information and authentication

**SQL Operations**:
```sql
-- SELECT user by email
SELECT * FROM "public"."users"
WHERE "email" = $1
LIMIT 1;

-- Used in: /teacherdashboard, /studentdashboard (lines 138-151)
```

---

### 2. **Classes Table**
**Purpose**: Store teacher classes with metadata

**Columns**: `id`, `class_name`, `subject`, `section`, `schedule`, `password`, `qr_data`, `teacher_id`, `subjects` (JSON), `created_at`

**SQL Operations**:

#### Insert New Class
```sql
INSERT INTO "public"."classes" 
(class_name, subject, section, schedule, password, qr_data, teacher_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;
```
**Endpoint**: `POST /api/add-class` (lines 165-188)
**Frontend Call**: `teacherdata.js`

#### Fetch All Teacher Classes
```sql
SELECT * FROM "public"."classes"
WHERE "teacher_id" = $1;
```
**Endpoint**: `GET /api/teacher-classes` (lines 190-211)
**Frontend Call**: `teacherdata.js`

#### Update Class Password
```sql
UPDATE "public"."classes"
SET "password" = $1
WHERE "id" = $2 AND "teacher_id" = $3;
```
**Endpoint**: `POST /api/update-passcode/:classId` (lines 590-629)
**Frontend Call**: `teacherdata.js`

#### Delete Class
```sql
DELETE FROM "public"."classes"
WHERE "id" = $1 AND "teacher_id" = $2;
```
**Endpoint**: `DELETE /api/delete-class/:classId` (lines 349-383)
**Frontend Call**: `teacherdata.js`

---

### 3. **Subjects (JSON Array in Classes)**
**Purpose**: Store multiple subjects per class

**Data Structure**:
```json
{
  "subjects": [
    {
      "id": 1776836143093,
      "subject": "Math",
      "start_time": "09:00",
      "end_time": "10:30",
      "room": "101",
      "days": "MWF"
    }
  ]
}
```

**SQL Operations**:

#### Add Single Subject
```sql
UPDATE "public"."classes"
SET "subjects" = array_append("subjects", $1)
WHERE "id" = $2 AND "teacher_id" = $3;
```
**Endpoint**: `POST /api/add-subject/:classId` (lines 213-252)

#### Add Multiple Subjects
```sql
UPDATE "public"."classes"
SET "subjects" = "subjects" || $1
WHERE "id" = $2 AND "teacher_id" = $3
RETURNING *;
```
**Endpoint**: `POST /api/add-subjects/:classId` (lines 254-310)

#### Fetch Subjects for Class
```sql
SELECT "subjects" FROM "public"."classes"
WHERE "id" = $1;
```
**Endpoint**: `GET /api/class-subjects/:classId` (lines 312-333)

#### Delete Subject
```sql
UPDATE "public"."classes"
SET "subjects" = array_remove("subjects", $1)
WHERE "id" = $2 AND "teacher_id" = $3;
```
**Endpoint**: `DELETE /api/delete-subject/:classId/:subjectId` (lines 385-441)

---

### 4. **Attendance Table**
**Purpose**: Track student attendance records

**Columns**: `id`, `student_id`, `student_name`, `student_email`, `class_id`, `subject_id`, `status`, `date`, `dow`, `time`, `room`, `created_at`

**SQL Operations**:

#### Fetch All Attendance for Student
```sql
SELECT * FROM "public"."attendance"
WHERE "student_id" = $1
ORDER BY "created_at" DESC;
```
**Endpoint**: `GET /api/user-attendance` (lines 545-559)
**Frontend Call**: `script.js` - `fetchAttendanceRecords()`

#### Fetch Attendance for Specific Subject (Teacher View)
```sql
SELECT 
  "id", "student_name", "student_email", "status", 
  "created_at", "class_id", "subject_id"
FROM "public"."attendance"
WHERE "class_id" = $1
ORDER BY "created_at" DESC;
```
**Endpoint**: `GET /api/subject-attendance/:classId/:subjectId` (lines 631-683)
**Filter Logic**: JavaScript filters by `subject_id` using `Math.trunc()` to handle both float and integer IDs

---

### 5. **Attendance Sessions Table**
**Purpose**: Track attendance session instances

**Columns**: `id`, `teacher_id`, `class_name`, `session_password`, `created_at`

**SQL Operations**:

#### Start New Attendance Session
```sql
INSERT INTO "public"."attendance_sessions" 
(teacher_id, class_name, session_password)
VALUES ($1, $2, $3)
RETURNING *;
```
**Endpoint**: `POST /api/start-attendance-session` (lines 443-465)

#### Fetch All Sessions for Teacher
```sql
SELECT * FROM "public"."attendance_sessions"
WHERE "teacher_id" = $1
ORDER BY "created_at" DESC;
```
**Endpoint**: `GET /api/attendance-sessions` (lines 467-486)

---

### 6. **Profiles Table**
**Purpose**: Store additional user profile information

**Columns**: `id`, `name`, `department`, `email`, `role`

**SQL Operations**:

#### Fetch User Profile
```sql
SELECT * FROM "public"."profiles"
WHERE "id" = $1;
```
**Endpoint**: `GET /api/user-profile` (lines 501-525)
**Frontend Call**: `script.js` - `fetchUserProfile()`

---

## 📡 API Endpoints Summary

### Authentication Routes
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/login` | Render login page |
| POST | `/login` | Supabase email/password auth |
| GET | `/register` | Render registration page |
| POST | `/register` | Create new Supabase user |
| GET | `/logout` | Destroy session |

### Student Routes
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/studentdashboard` | Render student dashboard |
| GET | `/api/user-profile` | Fetch user profile |
| GET | `/api/user-subjects` | Fetch enrolled classes |
| GET | `/api/user-attendance` | Fetch attendance history |
| GET | `/api/notifications` | Generate notifications |

### Teacher Routes
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/teacherdashboard` | Render teacher dashboard |
| POST | `/api/add-class` | Create new class |
| GET | `/api/teacher-classes` | Fetch teacher's classes |
| POST | `/api/add-subject/:classId` | Add single subject |
| POST | `/api/add-subjects/:classId` | Add multiple subjects |
| GET | `/api/class-subjects/:classId` | Fetch class subjects |
| POST | `/api/update-passcode/:classId` | Update class password |
| DELETE | `/api/delete-class/:classId` | Delete class |
| DELETE | `/api/delete-subject/:classId/:subjectId` | Delete subject |
| POST | `/api/start-attendance-session` | Start attendance session |
| GET | `/api/attendance-sessions` | Fetch sessions |
| GET | `/api/subject-attendance/:classId/:subjectId` | Fetch subject attendance |

---

## 🔐 Security Features

✅ **Session-based Authentication**: Uses express-session
✅ **Role-based Access Control**: `requireLogin` and role checks (`teacher` vs `student`)
✅ **Supabase Protection**: `requireSupabase` middleware ensures DB is configured
✅ **Endpoint Authorization**: Each endpoint verifies user role before processing
✅ **Password Hashing**: Supabase handles authentication securely

---

## 🎯 Frontend-to-Backend Connection Points

### Student Dashboard (`views/studentdashboard.ejs`)
- Calls: `fetchUserProfile()`, `fetchNotifications()`, `fetchAttendanceRecords()`, `fetchSubjects()`
- APIs: `/api/user-profile`, `/api/notifications`, `/api/user-attendance`, `/api/user-subjects`

### Teacher Dashboard (`views/teacherdashboard.ejs`)
- Calls: `loadClasses()`, `addClass()`, `addSubjects()`, `deleteClass()`, `updatePasscode()`, etc.
- APIs: `/api/teacher-classes`, `/api/add-class`, `/api/add-subjects`, `/api/delete-class`, `/api/update-passcode`, `/api/subject-attendance`

### Login/Register (`views/login.ejs`, `views/register.ejs`)
- Direct form submission to `/login` and `/register` routes
- Uses Supabase Auth

---

## ✅ Connectivity Status

| Component | Status | Notes |
|-----------|--------|-------|
| Express Server | ✅ Connected | Running on configurable port (default 5000) |
| Supabase Auth | ✅ Connected | Email/password authentication working |
| Database (Users) | ✅ Connected | User queries functional |
| Database (Classes) | ✅ Connected | CRUD operations implemented |
| Database (Attendance) | ✅ Connected | Recording and fetching attendance |
| Frontend → Backend | ✅ Connected | All fetch requests properly routed |
| Session Management | ✅ Connected | Session data persisting across requests |

---

## 📝 Environment Variables Required

```bash
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-anon-key
SESSION_SECRET=your-session-secret
PORT=5000 (optional, defaults to 5000)
```

---

## 🚀 How to Test Connectivity

1. **Backend Health**: Visit `http://localhost:5000/login`
2. **Database Connection**: Try logging in (will test Supabase auth)
3. **Session Management**: After login, check if dashboard loads
4. **API Endpoints**: Open browser DevTools → Network tab → Check API calls

---

## 🔧 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Supabase not configured" error | Add `SUPABASE_URL` and `SUPABASE_KEY` to `.env` |
| Port already in use | App automatically tries next port |
| Subject ID mismatches | App handles both float and integer IDs with `Math.trunc()` |
| Session not persisting | Ensure SESSION_SECRET is set in `.env` |

---

## 📚 File Structure Reference

```
node-app/
├── server.js              ← Main Express app with all SQL operations
├── views/
│   ├── login.ejs         ← Login page
│   ├── register.ejs      ← Registration page
│   ├── studentdashboard.ejs
│   └── teacherdashboard.ejs
├── static/
│   ├── script.js         ← Student dashboard logic
│   ├── teacherdata.js    ← Teacher dashboard logic
│   ├── style.css
│   ├── dashboardstyle.css
│   └── teacherstyle.css
└── package.json          ← Dependencies
```

---

**Last Updated**: April 2026
**Status**: All systems operational ✅
