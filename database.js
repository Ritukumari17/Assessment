const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashPassword } = require('./auth');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'tasks.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
console.log('Initializing database schema...');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Member')),
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH')),
    assigned_to INTEGER,
    due_date TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Seed default data if empty
try {
  const countUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (countUsers.count === 0) {
    console.log('Seeding initial database data...');
    
    // Seed users
    const insertUser = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
    
    const adminHash = hashPassword('admin123');
    const alexHash = hashPassword('alex123');
    const sarahHash = hashPassword('sarah123');
    
    insertUser.run('admin', 'admin@example.com', adminHash); // ID: 1
    insertUser.run('alex', 'alex@example.com', alexHash);   // ID: 2
    insertUser.run('sarah', 'sarah@example.com', sarahHash); // ID: 3

    // Seed projects
    const insertProject = db.prepare('INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)');
    insertProject.run('Apollo Expedition', 'Build a brand new landing system for moon exploration.', 1); // ID: 1
    insertProject.run('Helios Analytics', 'Dashboard optimization and server performance monitoring.', 2); // ID: 2

    // Seed project members
    const insertMember = db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)');
    // Apollo project (admin creator is Admin, alex and sarah are Members)
    insertMember.run(1, 1, 'Admin');
    insertMember.run(1, 2, 'Member');
    insertMember.run(1, 3, 'Member');

    // Helios project (alex creator is Admin, admin is a Member)
    insertMember.run(2, 2, 'Admin');
    insertMember.run(2, 1, 'Member');

    // Seed tasks
    const insertTask = db.prepare(`
      INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, due_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Tasks for Apollo Expedition (ID: 1)
    insertTask.run(1, 'Draft launch pad structural design', 'Create detailed structural and materials blueprint for Launch Pad B.', 'TODO', 'HIGH', 2, '2026-06-15', 1);
    insertTask.run(1, 'Evaluate fuel efficiency model', 'Run high-fidelity math simulations on liquid hydrogen mix.', 'IN_PROGRESS', 'MEDIUM', 3, '2026-06-30', 1);
    insertTask.run(1, 'Confirm radio telemetry protocol', 'Finalize encryption specs and frequency allocations with NASA.', 'DONE', 'HIGH', 1, '2026-05-10', 1);
    insertTask.run(1, 'Calibrate lunar descent sensors', 'Test laser altimeter calibration arrays in simulated dust.', 'TODO', 'MEDIUM', null, '2026-05-18', 1); // Overdue todo task
    
    // Tasks for Helios Analytics (ID: 2)
    insertTask.run(2, 'Optimize indexing in telemetry table', 'Apply compound indexes on timestamps and metric keys.', 'IN_PROGRESS', 'HIGH', 2, '2026-05-28', 2);
    insertTask.run(2, 'Set up custom alert webhooks', 'Send slack/discord signals on server CPU exceeding 95% threshold.', 'DONE', 'LOW', 1, '2026-05-12', 2);
    
    console.log('Database seeded successfully.');
  } else {
    console.log('Database already initialized.');
  }
} catch (err) {
  console.error('Error seeding database:', err);
}

module.exports = db;
