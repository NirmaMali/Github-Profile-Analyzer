/* ============================================================
   GitHub Profile Analyzer — Frontend Application
   ============================================================ */

const API = ''; // relative URL — works on both localhost and Render

// ----- State -----
let currentPage = 1;
let totalPages = 1;
let currentSort = 'analyzed_at';
let currentOrder = 'desc';
const PAGE_LIMIT = 10;
const GITHUB_API = 'https://api.github.com';

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getScoreBadge(score) {
  const num = Number(score);
  if (isNaN(num)) return '<span class="badge badge-score-red">N/A</span>';
  let cls = 'badge-score-red';
  if (num >= 70) cls = 'badge-score-green';
  else if (num >= 40) cls = 'badge-score-amber';
  return `<span class="badge ${cls}">${num}</span>`;
}

function showLoading(el) {
  el.classList.remove('hidden');
}

function hideLoading(el) {
  el.classList.add('hidden');
}

function showAlert(container, message, type = 'error') {
  const cls = type === 'success' ? 'alert-success' : type === 'info' ? 'alert-info' : 'alert-error';
  const icon = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '✕';
  container.innerHTML = `<div class="alert ${cls}"><span>${icon}</span> ${escapeHtml(message)}</div>`;
  setTimeout(() => {
    const alert = container.querySelector('.alert');
    if (alert) {
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-8px)';
      alert.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(() => { container.innerHTML = ''; }, 300);
    }
  }, 5000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function num(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function getGitHubHeaders() {
  return {
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function parseJsonSafely(response) {
  return response.text().then((text) => {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (err) {
      return {};
    }
  });
}

function shouldUseBrowserFallback(status, data) {
  const message = `${data?.error || ''} ${data?.message || ''}`.toLowerCase();
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    message.includes('github api') ||
    message.includes('rate limit') ||
    message.includes('network')
  );
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, { headers: getGitHubHeaders() });
  const data = await parseJsonSafely(response);

  if (response.status === 404) {
    throw new Error('GitHub user not found');
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new Error('GitHub rate limit exceeded. Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status})`);
  }

  return data;
}

async function fetchGitHubRepos(username) {
  const allRepos = [];

  for (let page = 1; page <= 10; page++) {
    const repos = await fetchGitHubJson(
      `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=updated`
    );
    allRepos.push(...repos);

    if (repos.length < 100) {
      break;
    }
  }

  return allRepos;
}

async function analyzeProfileFromBrowser(username) {
  const [profile, repos] = await Promise.all([
    fetchGitHubJson(`${GITHUB_API}/users/${encodeURIComponent(username)}`),
    fetchGitHubRepos(username),
  ]);

  const response = await fetch(`${API}/api/profiles/analyze/${encodeURIComponent(username)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile, repos }),
  });
  const data = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }

  return data;
}

async function requestProfileAnalysis(username) {
  const response = await fetch(`${API}/api/profiles/analyze/${encodeURIComponent(username)}`, {
    method: 'POST',
  });
  const data = await parseJsonSafely(response);

  if (response.ok) {
    return data;
  }

  if (shouldUseBrowserFallback(response.status, data)) {
    return analyzeProfileFromBrowser(username);
  }

  throw new Error(data.error || data.message || `Request failed (${response.status})`);
}

// ===================================================================
// TAB SWITCHING
// ===================================================================

const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchTab(tabName) {
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.tab === tabName));
  tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${tabName}`));
  if (tabName === 'profiles') loadProfiles();
}

navItems.forEach((item) => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(item.dataset.tab); }
  });
});

// ===================================================================
// 1. ANALYZE TAB
// ===================================================================

const analyzeInput = document.getElementById('analyze-username');
const analyzeBtn = document.getElementById('analyze-btn');
const analyzeAlert = document.getElementById('analyze-alert');
const analyzeLoading = document.getElementById('analyze-loading');
const analyzeResult = document.getElementById('analyze-result');

analyzeBtn.addEventListener('click', analyzeProfile);
analyzeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') analyzeProfile(); });

async function analyzeProfile() {
  const username = analyzeInput.value.trim();
  if (!username) {
    showAlert(analyzeAlert, 'Please enter a GitHub username.', 'error');
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing…';
  analyzeResult.innerHTML = '';
  analyzeAlert.innerHTML = '';
  showLoading(analyzeLoading);

  try {
    const data = await requestProfileAnalysis(username);
    const profile = data.data || data;
    renderProfileCard(analyzeResult, profile, data.cached);
  } catch (err) {
    showAlert(analyzeAlert, err.message, 'error');
  } finally {
    hideLoading(analyzeLoading);
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Analyze Profile`;
  }
}

function renderProfileCard(container, p, cached = false) {
  const location = p.location ? `<span>📍 ${escapeHtml(p.location)}</span>` : '';
  const company = p.company ? `<span>🏢 ${escapeHtml(p.company)}</span>` : '';
  const bio = p.bio ? `<div class="bio">${escapeHtml(p.bio)}</div>` : '';
  const cachedTag = cached ? '<span class="cached-badge">⚡ Cached</span>' : '';

  container.innerHTML = `
    <div class="card card-lg profile-card">
      <div class="profile-header">
        <img class="profile-avatar" src="${escapeHtml(p.avatar_url || '')}" alt="${escapeHtml(p.username || '')}" />
        <div class="profile-info">
          <h3>${escapeHtml(p.name || p.username || '')}</h3>
          <div class="username">@${escapeHtml(p.username || '')}</div>
          ${bio}
        </div>
      </div>
      ${(location || company) ? `<div class="profile-meta">${location}${company}</div>` : ''}
      <div class="stats-grid">
        <div class="stat-item"><div class="stat-value">${num(p.public_repos)}</div><div class="stat-label">Repos</div></div>
        <div class="stat-item"><div class="stat-value">${num(p.followers)}</div><div class="stat-label">Followers</div></div>
        <div class="stat-item"><div class="stat-value">${num(p.following)}</div><div class="stat-label">Following</div></div>
        <div class="stat-item"><div class="stat-value">${num(p.total_stars)}</div><div class="stat-label">Stars</div></div>
        <div class="stat-item"><div class="stat-value">${num(p.total_forks)}</div><div class="stat-label">Forks</div></div>
        <div class="stat-item"><div class="stat-value">${escapeHtml(p.top_language || 'N/A')}</div><div class="stat-label">Top Language</div></div>
      </div>
      <div class="profile-footer">
        <div>Activity Score: ${getScoreBadge(p.activity_score)}</div>
        ${cachedTag}
      </div>
    </div>`;
}

// ===================================================================
// 2. ALL PROFILES TAB
// ===================================================================

const profilesLoading = document.getElementById('profiles-loading');
const profilesTableWrapper = document.getElementById('profiles-table-wrapper');
const profilesTbody = document.getElementById('profiles-tbody');
const profilesEmpty = document.getElementById('profiles-empty');
const profilesPagination = document.getElementById('profiles-pagination');
const pageInfo = document.getElementById('page-info');
const pagePrev = document.getElementById('page-prev');
const pageNext = document.getElementById('page-next');
const sortSelect = document.getElementById('sort-select');
const orderToggle = document.getElementById('order-toggle');

sortSelect.addEventListener('change', () => { currentSort = sortSelect.value; currentPage = 1; loadProfiles(); });
orderToggle.addEventListener('click', () => {
  currentOrder = currentOrder === 'desc' ? 'asc' : 'desc';
  orderToggle.textContent = currentOrder === 'desc' ? '↓ DESC' : '↑ ASC';
  currentPage = 1;
  loadProfiles();
});
pagePrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadProfiles(); } });
pageNext.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; loadProfiles(); } });

async function loadProfiles() {
  profilesTableWrapper.classList.add('hidden');
  profilesEmpty.classList.add('hidden');
  profilesPagination.classList.add('hidden');
  showLoading(profilesLoading);

  try {
    const url = `${API}/api/profiles?sort=${currentSort}&order=${currentOrder}&page=${currentPage}&limit=${PAGE_LIMIT}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load profiles');

    const profiles = data.data || [];
    totalPages = data.totalPages || 1;
    currentPage = data.page || 1;

    if (profiles.length === 0) {
      profilesEmpty.classList.remove('hidden');
      return;
    }

    profilesTbody.innerHTML = profiles.map((p) => `
      <tr>
        <td><img class="table-avatar" src="${escapeHtml(p.avatar_url || '')}" alt="" /></td>
        <td class="table-username">${escapeHtml(p.username || '')}</td>
        <td>${num(p.public_repos)}</td>
        <td>${num(p.followers)}</td>
        <td>${num(p.total_stars)}</td>
        <td>${escapeHtml(p.top_language || '—')}</td>
        <td>${formatDate(p.analyzed_at)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-outline btn-sm" onclick="viewProfile('${escapeHtml(p.username)}')">View</button>
            <button class="btn btn-danger btn-sm" onclick="deleteProfileInline('${escapeHtml(p.username)}', this)">Delete</button>
          </div>
        </td>
      </tr>`).join('');

    profilesTableWrapper.classList.remove('hidden');
    profilesPagination.classList.remove('hidden');
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    pagePrev.disabled = currentPage <= 1;
    pageNext.disabled = currentPage >= totalPages;
  } catch (err) {
    profilesEmpty.innerHTML = `<div class="empty-state-icon">⚠️</div><h3>Error loading profiles</h3><p>${escapeHtml(err.message)}</p>`;
    profilesEmpty.classList.remove('hidden');
  } finally {
    hideLoading(profilesLoading);
  }
}

async function deleteProfileInline(username, btnEl) {
  if (!confirm(`Are you sure you want to delete "${username}"?`)) return;
  btnEl.disabled = true;
  btnEl.textContent = '…';
  try {
    const res = await fetch(`${API}/api/profiles/${encodeURIComponent(username)}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Delete failed');
    }
    loadProfiles();
  } catch (err) {
    alert('Error: ' + err.message);
    btnEl.disabled = false;
    btnEl.textContent = 'Delete';
  }
}

// ===================================================================
// 3. COMPARE TAB
// ===================================================================

const compareUser1 = document.getElementById('compare-user1');
const compareUser2 = document.getElementById('compare-user2');
const compareBtn = document.getElementById('compare-btn');
const compareAlert = document.getElementById('compare-alert');
const compareLoading = document.getElementById('compare-loading');
const compareResult = document.getElementById('compare-result');

compareBtn.addEventListener('click', compareProfiles);

async function compareProfiles() {
  const user1 = compareUser1.value.trim();
  const user2 = compareUser2.value.trim();

  if (!user1 || !user2) {
    showAlert(compareAlert, 'Please enter both usernames.', 'error');
    return;
  }
  if (user1.toLowerCase() === user2.toLowerCase()) {
    showAlert(compareAlert, 'Please enter two different usernames.', 'error');
    return;
  }

  compareBtn.disabled = true;
  compareBtn.innerHTML = '<span class="spinner"></span> Comparing…';
  compareResult.innerHTML = '';
  compareAlert.innerHTML = '';
  showLoading(compareLoading);

  try {
    // Silently analyze both users first
    await Promise.all([
      requestProfileAnalysis(user1),
      requestProfileAnalysis(user2),
    ]);

    // Now compare
    const res = await fetch(`${API}/api/profiles/compare?users=${encodeURIComponent(user1)},${encodeURIComponent(user2)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Comparison failed');

    const profiles = data.data || [];
    if (profiles.length < 2) throw new Error('Could not retrieve both profiles for comparison.');

    renderCompareCards(compareResult, profiles[0], profiles[1]);
  } catch (err) {
    showAlert(compareAlert, err.message, 'error');
  } finally {
    hideLoading(compareLoading);
    compareBtn.disabled = false;
    compareBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> Compare`;
  }
}

function renderCompareCards(container, p1, p2) {
  const stats = ['followers', 'public_repos', 'total_stars', 'total_forks', 'activity_score'];
  const labels = { followers: 'Followers', public_repos: 'Repos', total_stars: 'Stars', total_forks: 'Forks', activity_score: 'Activity Score' };

  // Determine overall winner by counting stat wins
  let wins1 = 0, wins2 = 0;
  stats.forEach((s) => {
    if (num(p1[s]) > num(p2[s])) wins1++;
    else if (num(p2[s]) > num(p1[s])) wins2++;
  });

  function buildCard(p, other, isOverallWinner) {
    const winnerBadge = isOverallWinner ? '<div class="winner-badge">🏆 Winner</div>' : '';
    const statHtml = stats.map((s) => {
      const isWinner = num(p[s]) > num(other[s]);
      const cls = isWinner ? 'stat-winner' : '';
      return `<div class="stat-item ${cls}"><div class="stat-value">${num(p[s])}</div><div class="stat-label">${labels[s]}</div></div>`;
    }).join('');

    return `
      <div class="card card-lg compare-card">
        ${winnerBadge}
        <div class="profile-header">
          <img class="profile-avatar" src="${escapeHtml(p.avatar_url || '')}" alt="" />
          <div class="profile-info">
            <h3>${escapeHtml(p.name || p.username || '')}</h3>
            <div class="username">@${escapeHtml(p.username || '')}</div>
          </div>
        </div>
        <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
          ${statHtml}
        </div>
        <div class="profile-footer">
          <span>Top Language: <strong>${escapeHtml(p.top_language || 'N/A')}</strong></span>
        </div>
      </div>`;
  }

  container.innerHTML = `<div class="compare-grid">${buildCard(p1, p2, wins1 > wins2)}${buildCard(p2, p1, wins2 > wins1)}</div>`;
}

// ===================================================================
// 4. DELETE TAB
// ===================================================================

const deleteInput = document.getElementById('delete-username');
const deleteBtn = document.getElementById('delete-btn');
const deleteAlert = document.getElementById('delete-alert');

deleteBtn.addEventListener('click', deleteProfile);
deleteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') deleteProfile(); });

async function deleteProfile() {
  const username = deleteInput.value.trim();
  if (!username) {
    showAlert(deleteAlert, 'Please enter a username.', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to delete "${username}"? This action cannot be undone.`)) return;

  deleteBtn.disabled = true;
  deleteBtn.innerHTML = '<span class="spinner"></span> Deleting…';

  try {
    const res = await fetch(`${API}/api/profiles/${encodeURIComponent(username)}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `Failed to delete (${res.status})`);

    showAlert(deleteAlert, `Profile "${username}" deleted successfully.`, 'success');
    deleteInput.value = '';
  } catch (err) {
    showAlert(deleteAlert, err.message, 'error');
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Delete Profile`;
  }
}

// ===================================================================
// 5. MODAL
// ===================================================================

const modalOverlay = document.getElementById('profile-modal');
const modalBody = document.getElementById('modal-body');
const modalTitle = document.getElementById('modal-title');
const modalCloseBtn = document.getElementById('modal-close-btn');

modalCloseBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function openModal() {
  modalOverlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.remove('visible');
  document.body.style.overflow = '';
}

async function viewProfile(username) {
  modalTitle.textContent = `@${username}`;
  modalBody.innerHTML = '<div class="loading-container"><div class="spinner spinner-dark spinner-lg"></div><span>Loading profile…</span></div>';
  openModal();

  try {
    const res = await fetch(`${API}/api/profiles/${encodeURIComponent(username)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Profile not found');

    const p = data.data || data;
    renderProfileCard(modalBody, p, false);
  } catch (err) {
    modalBody.innerHTML = `<div class="alert alert-error"><span>✕</span> ${escapeHtml(err.message)}</div>`;
  }
}

// Make viewProfile globally accessible for onclick handlers in table
window.viewProfile = viewProfile;
window.deleteProfileInline = deleteProfileInline;
