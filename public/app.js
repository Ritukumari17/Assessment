/* ==========================================================================
   AETHER TASK CLIENT CONTROLLER (SPA)
   Handles API interaction, routing, dynamic DOM rendering & Drag-and-Drop
   ========================================================================== */

// --- GLOBAL APPLICATION STATE ---
const state = {
  currentUser: null,      // { id, username, email }
  projects: [],           // List of user's projects
  activeProject: null,    // Selected project { id, name, description, role }
  projectMembers: [],     // Members of the active project
  tasks: [],              // Tasks of the active project
  activeTab: 'dashboard'  // 'dashboard' | 'board'
};

// --- DOM ELEMENTS CACHE ---
const dom = {
  // Screens
  authScreen: document.getElementById('auth-screen'),
  appScreen: document.getElementById('app-screen'),
  
  // Auth forms
  loginForm: document.getElementById('login-form'),
  signupForm: document.getElementById('signup-form'),
  toSignup: document.getElementById('to-signup'),
  toLogin: document.getElementById('to-login'),
  
  // Navigation / Sidebar
  sidebarProjects: document.getElementById('sidebar-projects-list'),
  btnNewProject: document.getElementById('btn-new-project'),
  btnLogout: document.getElementById('btn-logout'),
  navDashboard: document.getElementById('nav-dashboard'),
  userDisplayName: document.getElementById('user-display-name'),
  userDisplayEmail: document.getElementById('user-display-email'),
  userAvatar: document.getElementById('user-avatar'),
  
  // Header
  activeProjectTitle: document.getElementById('active-project-title'),
  activeProjectDesc: document.getElementById('active-project-desc'),
  projectMembersPreview: document.getElementById('project-members-preview'),
  btnManageMembers: document.getElementById('btn-manage-members'),
  btnNewTask: document.getElementById('btn-new-task'),
  
  // View Tabs
  tabDashboard: document.getElementById('tab-dashboard'),
  tabBoard: document.getElementById('tab-board'),
  viewDashboardPanel: document.getElementById('view-dashboard-panel'),
  viewBoardPanel: document.getElementById('view-board-panel'),
  
  // Dashboard Metrics
  statTotalTasks: document.getElementById('stat-total-tasks'),
  statMyTasks: document.getElementById('stat-my-tasks'),
  statHighPriority: document.getElementById('stat-high-priority'),
  statOverdue: document.getElementById('stat-overdue'),
  completionPercentage: document.getElementById('completion-percentage'),
  progressBarTodo: document.getElementById('progress-bar-todo'),
  progressBarProgress: document.getElementById('progress-bar-progress'),
  progressBarDone: document.getElementById('progress-bar-done'),
  legendTodoVal: document.getElementById('legend-todo-val'),
  legendProgressVal: document.getElementById('legend-progress-val'),
  legendDoneVal: document.getElementById('legend-done-val'),
  insightProjectsCount: document.getElementById('insight-projects-count'),
  insightUserRole: document.getElementById('insight-user-role'),
  
  // Kanban Columns
  listTodo: document.getElementById('list-todo'),
  listProgress: document.getElementById('list-progress'),
  listDone: document.getElementById('list-done'),
  countTodo: document.getElementById('count-todo'),
  countProgress: document.getElementById('count-progress'),
  countDone: document.getElementById('count-done'),
  
  // Modals
  modalProject: document.getElementById('modal-project'),
  projectForm: document.getElementById('project-form'),
  
  modalTask: document.getElementById('modal-task'),
  taskForm: document.getElementById('task-form'),
  taskModalTitle: document.getElementById('task-modal-title'),
  taskEditId: document.getElementById('task-edit-id'),
  taskTitle: document.getElementById('task-title'),
  taskDesc: document.getElementById('task-desc'),
  taskPriority: document.getElementById('task-priority'),
  taskStatus: document.getElementById('task-status'),
  taskAssignee: document.getElementById('task-assignee'),
  taskDueDate: document.getElementById('task-duedate'),
  btnDeleteTask: document.getElementById('btn-delete-task'),
  btnSubmitTask: document.getElementById('btn-submit-task'),
  
  modalMembers: document.getElementById('modal-members'),
  memberInviteForm: document.getElementById('member-invite-form'),
  inviteUsername: document.getElementById('invite-username'),
  inviteRole: document.getElementById('invite-role'),
  membersTableBody: document.getElementById('modal-members-table-body'),
  
  toastContainer: document.getElementById('toast-container')
};

// --- BASE API REQUEST HELPER ---
async function apiCall(endpoint, options = {}) {
  const url = `${endpoint}`;
  
  // Automatically inject JSON content type if sending body
  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    options.headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
  }
  
  // Read credential cookies automatically (SameSite/HttpOnly)
  options.credentials = 'include';
  
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err.message);
    throw err;
  }
}

// --- TOAST NOTIFICATIONS HUB ---
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '';
  if (type === 'success') {
    icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>`;
  } else if (type === 'error') {
    icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-red)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else {
    icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }
  
  toast.innerHTML = `${icon}<span>${message}</span>`;
  dom.toastContainer.appendChild(toast);
  
  // Fade out and remove
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

// --- AUTHENTICATION FLOWS ---
async function checkAuthOnBoot() {
  try {
    const data = await apiCall('/api/auth/me');
    if (data.user) {
      state.currentUser = data.user;
      showToast(`Welcome back, ${data.user.username}!`, 'info');
      initializeWorkspace();
    }
  } catch (err) {
    // Not logged in, keep auth screen visible
    dom.authScreen.style.display = 'flex';
    dom.appScreen.style.display = 'none';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const usernameOrEmail = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const data = await apiCall('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail, password }
    });
    
    state.currentUser = data.user;
    showToast(`Access Authorized. Initializing workspace...`);
    initializeWorkspace();
    dom.loginForm.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const username = document.getElementById('signup-username').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  
  try {
    const data = await apiCall('/api/auth/signup', {
      method: 'POST',
      body: { username, email, password }
    });
    
    state.currentUser = data.user;
    showToast(`Account created! Welcoming you to Assessment.`);
    initializeWorkspace();
    dom.signupForm.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLogout() {
  try {
    await apiCall('/api/auth/logout', { method: 'POST' });
    state.currentUser = null;
    state.projects = [];
    state.activeProject = null;
    state.tasks = [];
    state.projectMembers = [];
    
    dom.appScreen.style.display = 'none';
    dom.authScreen.style.display = 'flex';
    showToast('Logged out of system.', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- WORKSPACE & CONTENT MANAGERS ---
async function initializeWorkspace() {
  dom.authScreen.style.display = 'none';
  dom.appScreen.style.display = 'flex';
  
  // Render user details in sidebar
  dom.userDisplayName.textContent = state.currentUser.username;
  dom.userDisplayEmail.textContent = state.currentUser.email;
  dom.userAvatar.textContent = state.currentUser.username.substring(0, 2).toUpperCase();
  
  await loadProjects();
}

async function loadProjects(selectProjectId = null) {
  try {
    const data = await apiCall('/api/projects');
    state.projects = data.projects;
    
    renderSidebarProjects();
    
    if (state.projects.length > 0) {
      let nextActive = state.projects[0];
      if (selectProjectId) {
        const found = state.projects.find(p => p.id === Number(selectProjectId));
        if (found) nextActive = found;
      }
      await selectProject(nextActive.id);
    } else {
      // No projects
      state.activeProject = null;
      renderEmptyProjectState();
    }
  } catch (err) {
    showToast('Could not load projects list.', 'error');
  }
}

async function selectProject(projectId) {
  try {
    const data = await apiCall(`/api/projects/${projectId}`);
    state.activeProject = data.project; // { id, name, description, role }
    
    // Highlight sidebar project
    document.querySelectorAll('.project-nav-item').forEach(el => {
      if (Number(el.dataset.id) === projectId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
    
    // Update Header
    dom.activeProjectTitle.textContent = state.activeProject.name;
    dom.activeProjectDesc.textContent = state.activeProject.description || 'No description provided for this project.';
    
    // Manage Member interface options based on user role (Only admin can invite)
    if (state.activeProject.role === 'Admin') {
      dom.memberInviteForm.style.display = 'block';
    } else {
      dom.memberInviteForm.style.display = 'none';
    }
    
    // Fetch related project data
    await Promise.all([
      loadProjectMembers(),
      loadProjectTasks(),
      loadDashboardStats()
    ]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadProjectMembers() {
  try {
    const data = await apiCall(`/api/projects/${state.activeProject.id}/members`);
    state.projectMembers = data.members;
    renderMembersPreview();
    renderMembersModalTable();
    populateTaskAssigneeDropdown();
  } catch (err) {
    showToast('Could not fetch project members.', 'error');
  }
}

async function loadProjectTasks() {
  try {
    const data = await apiCall(`/api/projects/${state.activeProject.id}/tasks`);
    state.tasks = data.tasks;
    renderKanbanBoard();
  } catch (err) {
    showToast('Could not load project tasks.', 'error');
  }
}

async function loadDashboardStats() {
  try {
    const data = await apiCall('/api/dashboard');
    
    // Global stats
    dom.statTotalTasks.textContent = data.totalTasks;
    dom.statMyTasks.textContent = data.assignedToMe;
    dom.statHighPriority.textContent = data.highPriority;
    dom.statOverdue.textContent = data.overdueTasks;
    dom.insightProjectsCount.textContent = data.projectsCount;
    dom.insightUserRole.textContent = state.activeProject ? state.activeProject.role : 'Member';
    
    // Calculations for completion rate bar
    const total = data.totalTasks;
    const todo = data.todoTasks;
    const progress = data.inProgressTasks;
    const done = data.doneTasks;
    
    dom.legendTodoVal.textContent = todo;
    dom.legendProgressVal.textContent = progress;
    dom.legendDoneVal.textContent = done;
    
    if (total > 0) {
      const completionPercent = Math.round((done / total) * 100);
      dom.completionPercentage.textContent = `${completionPercent}%`;
      
      dom.progressBarDone.style.width = `${(done / total) * 100}%`;
      dom.progressBarProgress.style.width = `${(progress / total) * 100}%`;
      dom.progressBarTodo.style.width = `${(todo / total) * 100}%`;
    } else {
      dom.completionPercentage.textContent = '0%';
      dom.progressBarDone.style.width = '0%';
      dom.progressBarProgress.style.width = '0%';
      dom.progressBarTodo.style.width = '0%';
    }
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
  }
}

// --- DOM RENDERING HELPERS ---

function renderSidebarProjects() {
  dom.sidebarProjects.innerHTML = '';
  if (state.projects.length === 0) {
    dom.sidebarProjects.innerHTML = `<div style="padding: 10px 14px; font-size: 0.85rem; color: var(--text-dark);">No active workspaces.</div>`;
    return;
  }
  
  state.projects.forEach(project => {
    const item = document.createElement('button');
    item.className = 'project-nav-item';
    item.dataset.id = project.id;
    if (state.activeProject && state.activeProject.id === project.id) {
      item.classList.add('active');
    }
    
    item.innerHTML = `
      <span>${escapeHtml(project.name)}</span>
      <span class="project-role-badge">${project.role}</span>
    `;
    
    item.addEventListener('click', () => selectProject(project.id));
    dom.sidebarProjects.appendChild(item);
  });
}

function renderMembersPreview() {
  dom.projectMembersPreview.innerHTML = '';
  
  // Show max 4 avatars
  const previewUsers = state.projectMembers.slice(0, 4);
  const remainder = state.projectMembers.length - 4;
  
  if (remainder > 0) {
    const plusNode = document.createElement('div');
    plusNode.className = 'member-avatar-overlap overlap-plus';
    plusNode.textContent = `+${remainder}`;
    plusNode.title = `${remainder} more members`;
    dom.projectMembersPreview.appendChild(plusNode);
  }
  
  previewUsers.forEach(member => {
    const avatar = document.createElement('div');
    avatar.className = 'member-avatar-overlap';
    avatar.textContent = member.username.substring(0, 2).toUpperCase();
    avatar.title = `${member.username} (${member.role})`;
    
    // Style Admin slightly differently
    if (member.role === 'Admin') {
      avatar.style.borderColor = 'var(--color-violet)';
      avatar.style.color = 'var(--color-violet)';
    } else {
      avatar.style.borderColor = 'var(--color-cyan)';
    }
    
    dom.projectMembersPreview.appendChild(avatar);
  });
}

function renderMembersModalTable() {
  dom.membersTableBody.innerHTML = '';
  
  state.projectMembers.forEach(member => {
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td><strong>${escapeHtml(member.username)}</strong></td>
      <td>${escapeHtml(member.email)}</td>
      <td>
        <span class="member-table-role-badge ${member.role.toLowerCase()}">${member.role}</span>
      </td>
    `;
    
    dom.membersTableBody.appendChild(tr);
  });
}

function populateTaskAssigneeDropdown() {
  dom.taskAssignee.innerHTML = `<option value="">Unassigned</option>`;
  state.projectMembers.forEach(member => {
    const opt = document.createElement('option');
    opt.value = member.id;
    opt.textContent = `${member.username} (${member.role})`;
    dom.taskAssignee.appendChild(opt);
  });
}

function renderKanbanBoard() {
  // Clear lists
  dom.listTodo.innerHTML = '';
  dom.listProgress.innerHTML = '';
  dom.listDone.innerHTML = '';
  
  let todoCount = 0;
  let progressCount = 0;
  let doneCount = 0;
  
  if (state.tasks.length === 0) {
    const emptyMsg = `<div style="padding: 20px; font-size: 0.85rem; color: var(--text-dark); text-align: center; width: 100%;">No tasks assigned.</div>`;
    dom.listTodo.innerHTML = emptyMsg;
    dom.listProgress.innerHTML = emptyMsg;
    dom.listDone.innerHTML = emptyMsg;
    
    dom.countTodo.textContent = 0;
    dom.countProgress.textContent = 0;
    dom.countDone.textContent = 0;
    return;
  }
  
  state.tasks.forEach(task => {
    const card = createTaskCard(task);
    
    if (task.status === 'TODO') {
      dom.listTodo.appendChild(card);
      todoCount++;
    } else if (task.status === 'IN_PROGRESS') {
      dom.listProgress.appendChild(card);
      progressCount++;
    } else if (task.status === 'DONE') {
      dom.listDone.appendChild(card);
      doneCount++;
    }
  });
  
  dom.countTodo.textContent = todoCount;
  dom.countProgress.textContent = progressCount;
  dom.countDone.textContent = doneCount;
  
  // If a column is empty, show a small visual cue
  if (todoCount === 0) dom.listTodo.innerHTML = `<div class="drag-placeholder" style="padding: 20px; border: 1px dashed var(--border-light); border-radius: 8px; font-size: 0.8rem; color: var(--text-dark); text-align: center; margin-top: 10px;">Drag tasks here</div>`;
  if (progressCount === 0) dom.listProgress.innerHTML = `<div class="drag-placeholder" style="padding: 20px; border: 1px dashed var(--border-light); border-radius: 8px; font-size: 0.8rem; color: var(--text-dark); text-align: center; margin-top: 10px;">Drag tasks here</div>`;
  if (doneCount === 0) dom.listDone.innerHTML = `<div class="drag-placeholder" style="padding: 20px; border: 1px dashed var(--border-light); border-radius: 8px; font-size: 0.8rem; color: var(--text-dark); text-align: center; margin-top: 10px;">Drag tasks here</div>`;
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id = task.id;
  card.draggable = true; // HTML5 Drag & Drop enabled!
  
  // Format due date indicator
  let dateHtml = '';
  if (task.due_date) {
    const isOverdue = new Date(task.due_date) < new Date().setHours(0,0,0,0) && task.status !== 'DONE';
    dateHtml = `
      <div class="task-card-date ${isOverdue ? 'overdue' : ''}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>${task.due_date}</span>
      </div>
    `;
  } else {
    dateHtml = `<div></div>`;
  }
  
  // Format Assignee Avatar Initials
  let assigneeHtml = '';
  if (task.assignee_name) {
    const initials = task.assignee_name.substring(0, 2).toUpperCase();
    assigneeHtml = `<div class="task-card-assignee" title="Assigned to ${task.assignee_name}">${initials}</div>`;
  }
  
  card.innerHTML = `
    <div class="task-card-header">
      <h4>${escapeHtml(task.title)}</h4>
      <span class="priority-badge priority-${task.priority.toLowerCase()}">${task.priority}</span>
    </div>
    <p class="task-card-desc">${task.description ? escapeHtml(task.description) : 'No description.'}</p>
    <div class="task-card-footer">
      ${dateHtml}
      ${assigneeHtml}
    </div>
  `;
  
  // Click to edit
  card.addEventListener('click', (e) => {
    // Prevent opening modal if drag trigger
    if (card.classList.contains('dragging')) return;
    openEditTaskModal(task);
  });
  
  // --- DRAG EVENTS ---
  card.addEventListener('dragstart', () => {
    card.classList.add('dragging');
    // Subtle opacity styling
    setTimeout(() => card.style.opacity = '0.5', 0);
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    card.style.opacity = '1';
    
    // Remove drag highlights from columns
    document.querySelectorAll('.kanban-column').forEach(col => col.style.background = '');
  });
  
  return card;
}

function renderEmptyProjectState() {
  dom.activeProjectTitle.textContent = 'Welcome, Create a Workspace';
  dom.activeProjectDesc.textContent = 'Create your first project workspace on the sidebar to get started.';
  dom.projectMembersPreview.innerHTML = '';
  
  dom.listTodo.innerHTML = `<div style="padding:40px; text-align:center; width:100%; color:var(--text-dark);">No projects initialized.</div>`;
  dom.listProgress.innerHTML = `<div style="padding:40px; text-align:center; width:100%; color:var(--text-dark);">No projects initialized.</div>`;
  dom.listDone.innerHTML = `<div style="padding:40px; text-align:center; width:100%; color:var(--text-dark);">No projects initialized.</div>`;
  
  dom.countTodo.textContent = 0;
  dom.countProgress.textContent = 0;
  dom.countDone.textContent = 0;
  
  dom.statTotalTasks.textContent = 0;
  dom.statMyTasks.textContent = 0;
  dom.statHighPriority.textContent = 0;
  dom.statOverdue.textContent = 0;
}

// --- MODAL UTILITIES ---
function showModal(modalEl) {
  modalEl.classList.add('active');
}

function hideModal(modalEl) {
  modalEl.classList.remove('active');
}

// Populate Edit Task Modal with RBAC details
function openEditTaskModal(task) {
  dom.taskModalTitle.textContent = 'Modify Task Assignment';
  dom.taskEditId.value = task.id;
  dom.taskTitle.value = task.title;
  dom.taskDesc.value = task.description || '';
  dom.taskPriority.value = task.priority;
  dom.taskStatus.value = task.status;
  dom.taskAssignee.value = task.assigned_to || '';
  dom.taskDueDate.value = task.due_date || '';
  
  const role = state.activeProject.role;
  const isCreatorOrAdmin = (role === 'Admin' || task.created_by === state.currentUser.id);
  
  // Role-Based Access Control on forms:
  // Non-admins/non-creators can ONLY update status. Disable other fields!
  if (!isCreatorOrAdmin) {
    dom.taskTitle.disabled = true;
    dom.taskDesc.disabled = true;
    dom.taskPriority.disabled = true;
    dom.taskAssignee.disabled = true;
    dom.taskDueDate.disabled = true;
    dom.btnDeleteTask.style.display = 'none';
    dom.btnSubmitTask.textContent = 'Update Status';
    showToast('Role limits: Members can only modify task status.', 'info');
  } else {
    dom.taskTitle.disabled = false;
    dom.taskDesc.disabled = false;
    dom.taskPriority.disabled = false;
    dom.taskAssignee.disabled = false;
    dom.taskDueDate.disabled = false;
    dom.btnDeleteTask.style.display = 'block';
    dom.btnSubmitTask.textContent = 'Save Changes';
  }
  
  showModal(dom.modalTask);
}

function openCreateTaskModal() {
  if (!state.activeProject) {
    showToast('Please establish or enter a project first.', 'error');
    return;
  }
  
  dom.taskModalTitle.textContent = 'Draft Task Assignment';
  dom.taskForm.reset();
  dom.taskEditId.value = '';
  
  // Enable all fields
  dom.taskTitle.disabled = false;
  dom.taskDesc.disabled = false;
  dom.taskPriority.disabled = false;
  dom.taskAssignee.disabled = false;
  dom.taskDueDate.disabled = false;
  
  dom.btnDeleteTask.style.display = 'none';
  dom.btnSubmitTask.textContent = 'Assign Task';
  
  showModal(dom.modalTask);
}

// --- SUBMIT EVENTS ---

async function submitProjectForm(e) {
  e.preventDefault();
  const name = document.getElementById('project-name').value;
  const description = document.getElementById('project-desc').value;
  
  try {
    const data = await apiCall('/api/projects', {
      method: 'POST',
      body: { name, description }
    });
    
    showToast(`Project "${data.project.name}" created!`);
    hideModal(dom.modalProject);
    dom.projectForm.reset();
    
    // Refresh Projects list and auto-select new project
    await loadProjects(data.project.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitTaskForm(e) {
  e.preventDefault();
  const id = dom.taskEditId.value;
  
  const title = dom.taskTitle.value;
  const description = dom.taskDesc.value;
  const status = dom.taskStatus.value;
  const priority = dom.taskPriority.value;
  const assigned_to = dom.taskAssignee.value ? Number(dom.taskAssignee.value) : null;
  const due_date = dom.taskDueDate.value || null;
  
  const body = { status };
  
  // If creating new task
  if (!id) {
    try {
      await apiCall(`/api/projects/${state.activeProject.id}/tasks`, {
        method: 'POST',
        body: { title, description, status, priority, assigned_to, due_date }
      });
      showToast('New task assigned successfully!');
      hideModal(dom.modalTask);
      await Promise.all([loadProjectTasks(), loadDashboardStats()]);
    } catch (err) {
      showToast(err.message, 'error');
    }
    return;
  }
  
  // Editing existing task
  const role = state.activeProject.role;
  const originalTask = state.tasks.find(t => t.id === Number(id));
  const isCreatorOrAdmin = (role === 'Admin' || (originalTask && originalTask.created_by === state.currentUser.id));
  
  if (isCreatorOrAdmin) {
    body.title = title;
    body.description = description;
    body.priority = priority;
    body.assigned_to = assigned_to;
    body.due_date = due_date;
  }
  
  try {
    await apiCall(`/api/tasks/${id}`, {
      method: 'PUT',
      body
    });
    showToast('Task updated successfully!');
    hideModal(dom.modalTask);
    await Promise.all([loadProjectTasks(), loadDashboardStats()]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTask() {
  const id = dom.taskEditId.value;
  if (!id) return;
  
  if (!confirm('Are you sure you want to delete this task?')) return;
  
  try {
    await apiCall(`/api/tasks/${id}`, {
      method: 'DELETE'
    });
    showToast('Task deleted successfully.');
    hideModal(dom.modalTask);
    await Promise.all([loadProjectTasks(), loadDashboardStats()]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitMemberInviteForm(e) {
  e.preventDefault();
  const usernameOrEmail = dom.inviteUsername.value;
  const role = dom.inviteRole.value;
  
  try {
    await apiCall(`/api/projects/${state.activeProject.id}/members`, {
      method: 'POST',
      body: { usernameOrEmail, role }
    });
    
    showToast(`Team allocation updated for ${usernameOrEmail}`);
    dom.memberInviteForm.reset();
    await loadProjectMembers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- DRAG AND DROP KANBAN ENGINE ---
function setupDragAndDropEngine() {
  const columns = document.querySelectorAll('.kanban-column');
  
  columns.forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault(); // Required to allow drop!
      
      const draggingCard = document.querySelector('.task-card.dragging');
      if (!draggingCard) return;
      
      // Highlight column under drag
      column.style.background = 'rgba(139, 92, 246, 0.05)';
      
      const list = column.querySelector('.task-list');
      // Append card preview dynamically into column lists
      const afterElement = getDragAfterElement(list, e.clientY);
      if (afterElement == null) {
        list.appendChild(draggingCard);
      } else {
        list.insertBefore(draggingCard, afterElement);
      }
    });
    
    column.addEventListener('dragleave', () => {
      column.style.background = '';
    });
    
    column.addEventListener('drop', async () => {
      column.style.background = '';
      
      const card = document.querySelector('.task-card.dragging');
      if (!card) return;
      
      const taskId = Number(card.dataset.id);
      const newStatus = column.dataset.status;
      
      const task = state.tasks.find(t => t.id === taskId);
      if (task && task.status !== newStatus) {
        // Immediate visual update to count and status
        task.status = newStatus;
        
        try {
          // Sync with database asynchronously
          await apiCall(`/api/tasks/${taskId}`, {
            method: 'PUT',
            body: { status: newStatus }
          });
          
          showToast(`Task status synced to ${newStatus}`);
          await Promise.all([loadProjectTasks(), loadDashboardStats()]);
        } catch (err) {
          showToast(`Failed syncing task: ${err.message}`, 'error');
          // Revert state and board if fails
          await loadProjectTasks();
        }
      }
    });
  });
}

// Calculates sorting drop order within card stacks
function getDragAfterElement(list, y) {
  const draggableElements = [...list.querySelectorAll('.task-card:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- TAB SWITCHER & VIEWS ---
function setupTabNavigation() {
  dom.tabDashboard.addEventListener('click', () => switchTab('dashboard'));
  dom.tabBoard.addEventListener('click', () => switchTab('board'));
  dom.navDashboard.addEventListener('click', () => switchTab('dashboard'));
}

function switchTab(tabName) {
  state.activeTab = tabName;
  
  if (tabName === 'dashboard') {
    dom.tabDashboard.classList.add('active');
    dom.tabBoard.classList.remove('active');
    dom.navDashboard.classList.add('active');
    
    dom.viewDashboardPanel.classList.add('active');
    dom.viewBoardPanel.classList.remove('active');
    
    loadDashboardStats();
  } else {
    dom.tabDashboard.classList.remove('active');
    dom.tabBoard.classList.add('active');
    dom.navDashboard.classList.remove('active');
    
    dom.viewDashboardPanel.classList.remove('active');
    dom.viewBoardPanel.classList.add('active');
    
    loadProjectTasks();
  }
}

// --- UTILITY ESCAPE STRING HTML ---
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- EVENT BINDINGS REGISTER ---
function registerEventListeners() {
  // Auth screen toggle Forms
  dom.toSignup.addEventListener('click', (e) => {
    e.preventDefault();
    dom.loginForm.classList.remove('active');
    dom.signupForm.classList.add('active');
  });
  
  dom.toLogin.addEventListener('click', (e) => {
    e.preventDefault();
    dom.signupForm.classList.remove('active');
    dom.loginForm.classList.add('active');
  });
  
  // Form submissions
  dom.loginForm.addEventListener('submit', handleLogin);
  dom.signupForm.addEventListener('submit', handleSignup);
  dom.projectForm.addEventListener('submit', submitProjectForm);
  dom.taskForm.addEventListener('submit', submitTaskForm);
  dom.memberInviteForm.addEventListener('submit', submitMemberInviteForm);
  
  // Logout
  dom.btnLogout.addEventListener('click', handleLogout);
  
  // Add task & project buttons trigger modal
  dom.btnNewTask.addEventListener('click', openCreateTaskModal);
  dom.btnNewProject.addEventListener('click', () => showModal(dom.modalProject));
  dom.btnManageMembers.addEventListener('click', () => showModal(dom.modalMembers));
  
  // Cancel and close triggers
  document.querySelectorAll('.modal-close, .btn-cancel, .btn-close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) hideModal(modal);
    });
  });
  
  // Delete task button trigger
  dom.btnDeleteTask.addEventListener('click', deleteTask);
  
  // Click outside modal overlay closes it
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideModal(overlay);
    });
  });
}

// --- BOOTSTRAP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  registerEventListeners();
  setupTabNavigation();
  setupDragAndDropEngine();
  checkAuthOnBoot();
});
