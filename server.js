const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const db = require('./database');
const { verifyToken, generateToken } = require('./auth');

const PORT = process.env.PORT || 3000;

// Content type mappings for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
};

// JSON helper responses
function sendJSON(res, data, status = 200, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJSON(res, { error: message }, status);
}

// Read body stream from requests
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', err => reject(err));
  });
}

// Router matching helper
function matchRoute(method, reqMethod, pathname, routePattern) {
  if (method !== reqMethod) return null;
  
  const urlParts = pathname.split('/').filter(Boolean);
  const patternParts = routePattern.split('/').filter(Boolean);
  
  if (urlParts.length !== patternParts.length) return null;
  
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      const paramName = patternParts[i].slice(1);
      params[paramName] = urlParts[i];
    } else if (patternParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// Get logged-in user from headers or cookies
function getAuthUser(req) {
  let token = null;
  
  // Try Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  
  // Try Cookies if not in header
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const parts = cookie.split('=');
      acc[parts[0].trim()] = (parts[1] || '').trim();
      return acc;
    }, {});
    token = cookies['token'];
  }
  
  if (!token) return null;
  return verifyToken(token);
}

// Check project membership helper
function getProjectMembership(projectId, userId) {
  try {
    const stmt = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?');
    const result = stmt.get(Number(projectId), Number(userId));
    return result ? result.role : null;
  } catch (err) {
    return null;
  }
}

// Serve HTTP Request
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight options
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  console.log(`[${new Date().toISOString()}] ${method} ${pathname}`);

  try {
    // ----------------------------------------------------
    // 1. AUTHENTICATION ENDPOINTS
    // ----------------------------------------------------
    
    // POST /api/auth/signup
    if (method === 'POST' && pathname === '/api/auth/signup') {
      const { username, email, password } = await readBody(req);
      if (!username || !email || !password) {
        return sendError(res, 'Username, email, and password are required');
      }
      
      const cleanUsername = username.trim().toLowerCase();
      const cleanEmail = email.trim().toLowerCase();
      
      if (cleanUsername.length < 3) return sendError(res, 'Username must be at least 3 characters');
      if (password.length < 6) return sendError(res, 'Password must be at least 6 characters');
      if (!cleanEmail.includes('@')) return sendError(res, 'Invalid email format');

      try {
        const stmt = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
        const { hashPassword } = require('./auth');
        const hash = hashPassword(password);
        
        const result = stmt.run(cleanUsername, cleanEmail, hash);
        const userId = result.lastInsertRowid;
        
        // Log in user automatically
        const userPayload = { id: userId, username: cleanUsername, email: cleanEmail };
        const token = generateToken(userPayload);
        
        sendJSON(res, { user: userPayload }, 201, {
          'Set-Cookie': `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Strict`
        });
      } catch (err) {
        if (err.message.includes('UNIQUE constraint failed: users.username')) {
          return sendError(res, 'Username is already taken', 409);
        }
        if (err.message.includes('UNIQUE constraint failed: users.email')) {
          return sendError(res, 'Email is already registered', 409);
        }
        throw err;
      }
      return;
    }

    // POST /api/auth/login
    if (method === 'POST' && pathname === '/api/auth/login') {
      const { usernameOrEmail, password } = await readBody(req);
      if (!usernameOrEmail || !password) {
        return sendError(res, 'Username/Email and password are required');
      }
      
      const lookup = usernameOrEmail.trim().toLowerCase();
      const stmt = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?');
      const user = stmt.get(lookup, lookup);
      
      if (!user) {
        return sendError(res, 'Invalid username/email or password', 401);
      }
      
      const { verifyPassword } = require('./auth');
      if (!verifyPassword(password, user.password_hash)) {
        return sendError(res, 'Invalid username/email or password', 401);
      }
      
      const userPayload = { id: user.id, username: user.username, email: user.email };
      const token = generateToken(userPayload);
      
      sendJSON(res, { user: userPayload }, 200, {
        'Set-Cookie': `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Strict`
      });
      return;
    }

    // POST /api/auth/logout
    if (method === 'POST' && pathname === '/api/auth/logout') {
      sendJSON(res, { message: 'Logged out successfully' }, 200, {
        'Set-Cookie': 'token=; Path=/; HttpOnly; Max-Age=0; SameSite=Strict'
      });
      return;
    }

    // GET /api/auth/me
    if (method === 'GET' && pathname === '/api/auth/me') {
      const user = getAuthUser(req);
      if (!user) return sendError(res, 'Unauthorized', 401);
      return sendJSON(res, { user });
    }

    // ----------------------------------------------------
    // SECURE MIDDLEWARE: Requires user to be logged in below this line
    // ----------------------------------------------------
    const currentUser = getAuthUser(req);
    
    // Check if endpoint is API but user is unauthorized
    if (pathname.startsWith('/api/') && !currentUser) {
      return sendError(res, 'Unauthorized. Please login.', 401);
    }

    // ----------------------------------------------------
    // 2. PROJECT ENDPOINTS
    // ----------------------------------------------------

    // GET /api/projects
    if (method === 'GET' && pathname === '/api/projects') {
      const stmt = db.prepare(`
        SELECT p.id, p.name, p.description, p.created_at, pm.role 
        FROM projects p 
        JOIN project_members pm ON p.id = pm.project_id 
        WHERE pm.user_id = ?
        ORDER BY p.created_at DESC
      `);
      const projects = stmt.all(currentUser.id);
      return sendJSON(res, { projects });
    }

    // POST /api/projects
    if (method === 'POST' && pathname === '/api/projects') {
      const { name, description } = await readBody(req);
      if (!name || !name.trim()) return sendError(res, 'Project name is required');
      
      // Wrap project creation & membership in a manual transaction block
      try {
        const stmtProj = db.prepare('INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)');
        const resProj = stmtProj.run(name.trim(), description ? description.trim() : '', currentUser.id);
        const projectId = resProj.lastInsertRowid;
        
        const stmtMember = db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)');
        stmtMember.run(projectId, currentUser.id, 'Admin');
        
        return sendJSON(res, { 
          project: {
            id: projectId,
            name: name.trim(),
            description: description || '',
            role: 'Admin',
            created_at: new Date().toISOString()
          }
        }, 201);
      } catch (err) {
        throw err;
      }
    }

    // GET /api/projects/:id
    let params = matchRoute('GET', method, pathname, '/api/projects/:id');
    if (params) {
      const projectId = Number(params.id);
      const role = getProjectMembership(projectId, currentUser.id);
      if (!role) return sendError(res, 'Forbidden: You are not a member of this project', 403);
      
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!project) return sendError(res, 'Project not found', 404);
      
      return sendJSON(res, { project: { ...project, role } });
    }

    // GET /api/projects/:id/members
    params = matchRoute('GET', method, pathname, '/api/projects/:id/members');
    if (params) {
      const projectId = Number(params.id);
      const role = getProjectMembership(projectId, currentUser.id);
      if (!role) return sendError(res, 'Forbidden: Access Denied', 403);
      
      const members = db.prepare(`
        SELECT u.id, u.username, u.email, pm.role 
        FROM users u 
        JOIN project_members pm ON u.id = pm.user_id 
        WHERE pm.project_id = ?
        ORDER BY pm.role ASC, u.username ASC
      `).all(projectId);
      
      return sendJSON(res, { members });
    }

    // POST /api/projects/:id/members
    params = matchRoute('POST', method, pathname, '/api/projects/:id/members');
    if (params) {
      const projectId = Number(params.id);
      const currentRole = getProjectMembership(projectId, currentUser.id);
      if (currentRole !== 'Admin') {
        return sendError(res, 'Forbidden: Only project Admins can add or modify team members', 403);
      }
      
      const { usernameOrEmail, role } = await readBody(req);
      if (!usernameOrEmail || !role) {
        return sendError(res, 'Username/Email and role are required');
      }
      
      if (role !== 'Admin' && role !== 'Member') {
        return sendError(res, 'Invalid role. Must be Admin or Member.');
      }
      
      const lookup = usernameOrEmail.trim().toLowerCase();
      const targetUser = db.prepare('SELECT id, username FROM users WHERE username = ? OR email = ?').get(lookup, lookup);
      if (!targetUser) return sendError(res, 'User not found', 404);
      
      // Upsert project member
      try {
        const checkMember = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, targetUser.id);
        if (checkMember) {
          // Update role
          db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?').run(role, projectId, targetUser.id);
        } else {
          // Add new member
          db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, targetUser.id, role);
        }
        
        return sendJSON(res, { message: `User ${targetUser.username} added/updated as ${role} successfully` });
      } catch (err) {
        throw err;
      }
    }

    // ----------------------------------------------------
    // 3. TASK ENDPOINTS
    // ----------------------------------------------------

    // GET /api/projects/:id/tasks
    params = matchRoute('GET', method, pathname, '/api/projects/:id/tasks');
    if (params) {
      const projectId = Number(params.id);
      const role = getProjectMembership(projectId, currentUser.id);
      if (!role) return sendError(res, 'Forbidden: Access Denied', 403);
      
      const tasks = db.prepare(`
        SELECT t.*, u.username as assignee_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assigned_to = u.id 
        WHERE t.project_id = ?
        ORDER BY t.due_date ASC, t.id DESC
      `).all(projectId);
      
      return sendJSON(res, { tasks });
    }

    // POST /api/projects/:id/tasks
    params = matchRoute('POST', method, pathname, '/api/projects/:id/tasks');
    if (params) {
      const projectId = Number(params.id);
      const role = getProjectMembership(projectId, currentUser.id);
      if (!role) return sendError(res, 'Forbidden: Access Denied', 403);
      
      const { title, description, status, priority, assigned_to, due_date } = await readBody(req);
      if (!title || !title.trim()) return sendError(res, 'Task title is required');
      
      const taskStatus = status || 'TODO';
      const taskPriority = priority || 'MEDIUM';
      const assigneeId = assigned_to ? Number(assigned_to) : null;
      
      // Validate assignee is member of the project
      if (assigneeId) {
        const assigneeRole = getProjectMembership(projectId, assigneeId);
        if (!assigneeRole) {
          return sendError(res, 'Assignee must be a registered member of this project');
        }
      }
      
      const stmt = db.prepare(`
        INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, due_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        projectId,
        title.trim(),
        description ? description.trim() : '',
        taskStatus,
        taskPriority,
        assigneeId,
        due_date || null,
        currentUser.id
      );
      
      return sendJSON(res, {
        task: {
          id: result.lastInsertRowid,
          project_id: projectId,
          title: title.trim(),
          description: description || '',
          status: taskStatus,
          priority: taskPriority,
          assigned_to: assigneeId,
          due_date: due_date || null,
          created_by: currentUser.id
        }
      }, 201);
    }

    // PUT /api/tasks/:id
    params = matchRoute('PUT', method, pathname, '/api/tasks/:id');
    if (params) {
      const taskId = Number(params.id);
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      if (!task) return sendError(res, 'Task not found', 404);
      
      const role = getProjectMembership(task.project_id, currentUser.id);
      if (!role) return sendError(res, 'Forbidden: Access Denied', 403);
      
      const body = await readBody(req);
      const isCreatorOrAdmin = (role === 'Admin' || task.created_by === currentUser.id);
      
      if (!isCreatorOrAdmin) {
        // MEMBERS who did NOT create the task can ONLY update status!
        if (Object.keys(body).some(key => key !== 'status')) {
          return sendError(res, 'Forbidden: Members can only update task status. Edits to priority, details, or assignments require project Admin status or being the task creator.', 403);
        }
      }
      
      // Handle status update
      let status = task.status;
      if (body.status !== undefined) {
        if (!['TODO', 'IN_PROGRESS', 'DONE'].includes(body.status)) {
          return sendError(res, 'Invalid status. Must be TODO, IN_PROGRESS, or DONE.');
        }
        status = body.status;
      }
      
      let title = task.title;
      let description = task.description;
      let priority = task.priority;
      let assigned_to = task.assigned_to;
      let due_date = task.due_date;
      
      if (isCreatorOrAdmin) {
        if (body.title !== undefined) {
          if (!body.title.trim()) return sendError(res, 'Title cannot be empty');
          title = body.title.trim();
        }
        if (body.description !== undefined) description = body.description ? body.description.trim() : '';
        if (body.priority !== undefined) {
          if (!['LOW', 'MEDIUM', 'HIGH'].includes(body.priority)) {
            return sendError(res, 'Invalid priority. Must be LOW, MEDIUM, or HIGH.');
          }
          priority = body.priority;
        }
        if (body.assigned_to !== undefined) {
          const assigneeId = body.assigned_to ? Number(body.assigned_to) : null;
          if (assigneeId) {
            const assigneeRole = getProjectMembership(task.project_id, assigneeId);
            if (!assigneeRole) {
              return sendError(res, 'Assignee must be a registered member of this project');
            }
          }
          assigned_to = assigneeId;
        }
        if (body.due_date !== undefined) due_date = body.due_date || null;
      }
      
      db.prepare(`
        UPDATE tasks 
        SET title = ?, description = ?, status = ?, priority = ?, assigned_to = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(title, description, status, priority, assigned_to, due_date, taskId);
      
      return sendJSON(res, {
        task: { id: taskId, project_id: task.project_id, title, description, status, priority, assigned_to, due_date }
      });
    }

    // DELETE /api/tasks/:id
    params = matchRoute('DELETE', method, pathname, '/api/tasks/:id');
    if (params) {
      const taskId = Number(params.id);
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      if (!task) return sendError(res, 'Task not found', 404);
      
      const role = getProjectMembership(task.project_id, currentUser.id);
      if (!role) return sendError(res, 'Forbidden: Access Denied', 403);
      
      const isCreatorOrAdmin = (role === 'Admin' || task.created_by === currentUser.id);
      if (!isCreatorOrAdmin) {
        return sendError(res, 'Forbidden: Only project Admins or the task creator can delete tasks', 403);
      }
      
      db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
      return sendJSON(res, { message: 'Task deleted successfully' });
    }

    // ----------------------------------------------------
    // 4. DASHBOARD ENDPOINT
    // ----------------------------------------------------
    
    // GET /api/dashboard
    if (method === 'GET' && pathname === '/api/dashboard') {
      // Aggregate data from all projects the user has membership in
      const projectIds = db.prepare('SELECT project_id FROM project_members WHERE user_id = ?')
        .all(currentUser.id)
        .map(pm => pm.project_id);
        
      if (projectIds.length === 0) {
        return sendJSON(res, {
          totalTasks: 0,
          todoTasks: 0,
          inProgressTasks: 0,
          doneTasks: 0,
          assignedToMe: 0,
          overdueTasks: 0,
          highPriority: 0,
          projectsCount: 0
        });
      }
      
      const placeholders = projectIds.map(() => '?').join(',');
      
      // Total count across user's projects
      const totalTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE project_id IN (${placeholders})`).get(...projectIds).count;
      
      // Status breakdown
      const todoTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'TODO' AND project_id IN (${placeholders})`).get(...projectIds).count;
      const inProgressTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'IN_PROGRESS' AND project_id IN (${placeholders})`).get(...projectIds).count;
      const doneTasks = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'DONE' AND project_id IN (${placeholders})`).get(...projectIds).count;
      
      // Assigned to me
      const assignedToMe = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND project_id IN (${placeholders})`).get(currentUser.id, ...projectIds).count;
      
      // High priority tasks
      const highPriority = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE priority = 'HIGH' AND status != 'DONE' AND project_id IN (${placeholders})`).get(...projectIds).count;
      
      // Overdue tasks (due_date is in past, not completed)
      // Format today as YYYY-MM-DD
      const todayStr = new Date().toISOString().split('T')[0];
      const overdueTasks = db.prepare(`
        SELECT COUNT(*) as count 
        FROM tasks 
        WHERE due_date IS NOT NULL 
          AND due_date < ? 
          AND status != 'DONE' 
          AND project_id IN (${placeholders})
      `).get(todayStr, ...projectIds).count;
      
      return sendJSON(res, {
        totalTasks,
        todoTasks,
        inProgressTasks,
        doneTasks,
        assignedToMe,
        overdueTasks,
        highPriority,
        projectsCount: projectIds.length
      });
    }

    // ----------------------------------------------------
    // 5. STATIC FILES SERVING (PUBLIC DIR)
    // ----------------------------------------------------
    
    // Serve HTML, CSS, client side JS and assets
    const publicDir = path.join(__dirname, 'public');
    
    // Prevent path traversal escape
    let safePath = parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname;
    let filePath = path.join(publicDir, safePath);
    
    if (!filePath.startsWith(publicDir)) {
      return sendError(res, 'Access Denied', 403);
    }
    
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // For Single Page Application support, fallback to serving index.html
        const fallbackPath = path.join(publicDir, 'index.html');
        fs.readFile(fallbackPath, (err, content) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
          }
        });
      } else {
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        fs.readFile(filePath, (err, content) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
          }
        });
      }
    });

  } catch (err) {
    console.error('Server processing error:', err);
    sendError(res, 'Internal Server Error', 500);
  }
});

// Start Server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Assessment running at: http://localhost:${PORT}`);
  console.log(`⚙️  Node Version: ${process.version}`);
  console.log(`📂 Database: ${path.join(__dirname, 'tasks.db')}`);
  console.log(`====================================================`);
});
