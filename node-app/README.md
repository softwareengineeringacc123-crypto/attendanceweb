# Website Attendance Node.js

This is a Node.js version of the Website Attendance project, converted from the original Flask application.

## Features

- User authentication (login/register) with Supabase
- Role-based access (Teacher/Student)
- Teacher dashboard with class creation
- Student dashboard
- Multi-day schedule selection for classes
- Session-based authentication

## Setup

1. Install Node.js (version 16 or higher)
2. Copy `.env.example` to `.env`
3. Fill in your Supabase credentials:
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   SESSION_SECRET=replace_with_a_secret
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start the server:
   ```bash
   npm start
   ```

The app will run on http://localhost:5000

## Key Differences from Flask Version

- Uses Express.js instead of Flask
- Uses EJS templating instead of Jinja2
- Uses express-session instead of Flask sessions
- API endpoints are now `/api/*` routes
- Static files served from `/static/*` paths

## Database Schema

The app expects these Supabase tables:
- `users` - User profiles
- `classes` - Class information
- `attendance` - Attendance records

Make sure your Supabase database has these tables set up.