# Student Class Enrollment Setup

## Step 1: Create the Enrollment Table in Supabase

Run this SQL in your Supabase SQL Editor:

```sql
-- Create student_enrollments table to track which students are in which classes
CREATE TABLE IF NOT EXISTS student_enrollments (
  id bigint generated always as identity not null,
  student_id uuid not null,
  class_id bigint not null,
  enrolled_at timestamp without time zone default now(),
  constraint student_enrollments_pkey primary key (id),
  constraint student_enrollments_student_id_fkey foreign key (student_id) references auth.users (id) on delete cascade,
  constraint student_enrollments_class_id_fkey foreign key (class_id) references classes (id) on delete cascade,
  constraint student_enrollments_unique unique(student_id, class_id)
);

-- Enable RLS
ALTER TABLE student_enrollments ENABLE ROW LEVEL SECURITY;

-- Allow students to view their own enrollments
CREATE POLICY "Students can view their own enrollments"
ON student_enrollments
FOR SELECT
USING (auth.uid() = student_id);

-- Allow students to insert their own enrollments
CREATE POLICY "Students can enroll themselves"
ON student_enrollments
FOR INSERT
WITH CHECK (auth.uid() = student_id);

-- Add class_code column to classes table if not exists
ALTER TABLE classes
ADD COLUMN IF NOT EXISTS class_code text unique;

-- Generate unique codes for existing classes
UPDATE classes SET class_code = 'CLASS_' || id || '_' || substr(md5(random()::text), 1, 6) WHERE class_code IS NULL;
```

## Step 2: How It Works

### For Teachers:
- Each class gets a **class code** (e.g., `CLASS_123_a7f2k9`)
- Teachers can share this code with students
- Teachers can also view who's enrolled

### For Students:
- Students see an **"Enroll in Class"** button
- They enter the class code
- They get enrolled in the class and can see attendance

## Step 3: API Endpoints Needed

These are already set up in the backend - you just need to enable them:

```
POST /api/enroll-class - Student enrolls in a class
GET /api/enrolled-classes - Student gets their enrolled classes
GET /api/class-code/:classId - Teacher gets the class code
```

## Step 4: Frontend Changes

The student dashboard needs:
1. An "Enroll in Class" modal/form
2. Input field for class code
3. List of enrolled classes

---

**Ready to proceed with implementation?**
