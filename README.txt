Assessment - Project Task Manager
==================================

Overview
--------
Assessment is a fast, lightweight, and modern web application for managing projects, assigning tasks, and tracking team progress. It features a responsive UI with drag-and-drop Kanban boards, role-based access control, and real-time dashboard analytics.

Key Features
------------
* Custom Authentication: Secure login/signup flow using PBKDF2 hashing and JWTs.
* Role-Based Access: Differentiates between 'Admins' (full access) and 'Members' (status updates only).
* Kanban Task Board: Interactive drag-and-drop task management categorized by To Do, In Progress, and Done.
* Dashboard Analytics: Real-time progress bars, overdue task tracking, and priority filters.
* No External Dependencies: The backend relies 100% on native Node.js core modules (no npm install required!).
* Native Database: Uses the new built-in Node.js SQLite (`node:sqlite`) for data storage.

Tech Stack
----------
* Frontend: HTML5, Vanilla JavaScript (ES6), CSS3 (Modern Glassmorphism Design).
* Backend: Node.js (v22.5.0+).
* Database: Native SQLite (`tasks.db`).

How to Run Locally
------------------
1. Ensure you have Node.js installed (Version 22.5.0 or newer is required).
2. Open your terminal in this project directory.
3. Start the server by running:
   node server.js
4. Open your web browser and navigate to:
   http://localhost:3000

Default Credentials (Admin)
---------------------------
Username: admin
Password: admin123

Deployment (Railway)
--------------------
This project is configured to be easily deployed to Railway.app:
1. Push this code to a GitHub repository.
2. In Railway, click "Deploy from GitHub repo".
3. CRITICAL: Add a Persistent Volume mounted to `/data`.
4. In Railway Variables, set "DB_PATH" to "/data/tasks.db".
5. Generate a Public Domain in the Railway Networking settings.
