-- Cloudflare D1 Serverless SQL Database Schema for Campus Space

-- 1. Verified Students Table
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    reg_no TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Timetable Uploads Audit Log Table
CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    reg_no TEXT NOT NULL,
    file_name TEXT NOT NULL,
    r2_key TEXT,
    session_count INTEGER DEFAULT 0,
    extracted_rooms TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 3. Unified Timetable Events Table (Drives Global Room Availability)
CREATE TABLE IF NOT EXISTS timetable_events (
    id TEXT PRIMARY KEY,
    upload_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    block TEXT NOT NULL,
    day_of_week TEXT NOT NULL, -- 'Monday', 'Tuesday', etc.
    start_time TEXT NOT NULL,  -- '09:30'
    end_time TEXT NOT NULL,    -- '10:20'
    course_code TEXT,
    course_title TEXT,
    session_type TEXT,        -- 'Lecture', 'Practical', 'Tutorial'
    faculty TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (upload_id) REFERENCES uploads(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 4. Campus Rooms Registry Table
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,       -- e.g. '36-405'
    block TEXT NOT NULL,       -- e.g. '36'
    floor INTEGER DEFAULT 1,
    capacity INTEGER DEFAULT 8,
    has_projector BOOLEAN DEFAULT 1,
    has_whiteboard BOOLEAN DEFAULT 1,
    is_quiet BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Fast Availability Search Queries
CREATE INDEX IF NOT EXISTS idx_events_lookup ON timetable_events(room_id, day_of_week, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_events_block ON timetable_events(block, day_of_week);
CREATE INDEX IF NOT EXISTS idx_rooms_block ON rooms(block);
