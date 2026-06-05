// TaskOrbit Admin Controller

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  
  const loginForm = document.getElementById('login-form');
  const secretInput = document.getElementById('admin-secret-input');
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  const loginError = document.getElementById('login-error');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  
  const logoutBtn = document.getElementById('logout-btn');
  const generatorForm = document.getElementById('generator-form');
  const generateBtn = document.getElementById('generate-btn');
  
  const searchInput = document.getElementById('search-input');
  const filterStatus = document.getElementById('filter-status');
  const listLoader = document.getElementById('registry-loader');
  const emptyState = document.getElementById('empty-state');
  const tableContainer = document.getElementById('table-container');
  const registryList = document.getElementById('registry-list');
  const toastContainer = document.getElementById('toast-container');
  
  // Stat Elements
  const statTotal = document.getElementById('stat-total');
  const statActive = document.getElementById('stat-active');
  const statRevoked = document.getElementById('stat-revoked');

  // State
  let allLicenses = [];

  // Initialize
  checkAuth();

  // --- AUTHENTICATION FLOW ---

  // Check if session contains valid credentials
  async function checkAuth() {
    const secret = sessionStorage.getItem('admin_secret');
    if (!secret) {
      showView('login');
      return;
    }

    const verified = await verifyCredentials(secret);
    if (verified) {
      showView('dashboard');
      loadRegistry();
    } else {
      sessionStorage.removeItem('admin_secret');
      showView('login');
      showToast('Session expired or invalid key.', 'danger');
    }
  }

  // Verify credentials against the server
  async function verifyCredentials(secret) {
    try {
      const res = await fetch('/v1/admin/licenses', {
        method: 'GET',
        headers: {
          'x-admin-secret': secret
        }
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  // Toggle Password Mask
  togglePasswordBtn.addEventListener('click', () => {
    if (secretInput.type === 'password') {
      secretInput.type = 'text';
      togglePasswordBtn.textContent = '🙈';
    } else {
      secretInput.type = 'password';
      togglePasswordBtn.textContent = '👁️';
    }
  });

  // Handle Login Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const secret = secretInput.value.trim();
    if (!secret) return;

    // Show Loading
    setLoading(loginSubmitBtn, true);
    loginError.classList.add('hidden');

    const verified = await verifyCredentials(secret);
    setLoading(loginSubmitBtn, false);

    if (verified) {
      sessionStorage.setItem('admin_secret', secret);
      showView('dashboard');
      loadRegistry();
      showToast('Authorization successful!', 'success');
    } else {
      loginError.textContent = 'Access Denied: Invalid Admin Secret Key.';
      loginError.classList.remove('hidden');
      // Shake login card
      const card = loginForm.closest('.login-card');
      card.style.animation = 'none';
      setTimeout(() => card.style.animation = 'shake 0.3s ease', 10);
    }
  });

  // Log Out
  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('admin_secret');
    showView('login');
    secretInput.value = '';
    showToast('Logged out successfully.', 'info');
  });

  // --- API CALLS ---

  // Fetch licenses list from DB
  async function loadRegistry() {
    const secret = sessionStorage.getItem('admin_secret');
    if (!secret) return;

    listLoader.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    emptyState.classList.add('hidden');

    try {
      const res = await fetch('/v1/admin/licenses', {
        method: 'GET',
        headers: {
          'x-admin-secret': secret
        }
      });

      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }

      const data = await res.json();
      if (data.success) {
        allLicenses = data.licenses;
        updateStats();
        renderRegistry();
      } else {
        showToast(data.error || 'Failed to load registry.', 'danger');
      }
    } catch (err) {
      showToast('Network error connecting to API.', 'danger');
    } finally {
      listLoader.classList.add('hidden');
    }
  }

  // Generate new licenses
  generatorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const secret = sessionStorage.getItem('admin_secret');
    if (!secret) return;

    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const tier = document.getElementById('license-tier').value;
    const durationDays = parseInt(document.getElementById('license-duration').value);
    const count = parseInt(document.getElementById('key-count').value);

    setLoading(generateBtn, true);

    try {
      const res = await fetch('/v1/admin/license/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret
        },
        body: JSON.stringify({ name, email, tier, durationDays, count })
      });

      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }

      const data = await res.json();
      if (data.success) {
        showToast(`Successfully generated ${count} key(s)!`, 'success');
        generatorForm.reset();
        document.getElementById('license-tier').value = 'PRO';
        document.getElementById('license-duration').value = '30';
        document.getElementById('key-count').value = '1';
        loadRegistry();
      } else {
        showToast(data.error || 'Failed to generate keys.', 'danger');
      }
    } catch {
      showToast('Network error generating keys.', 'danger');
    } finally {
      setLoading(generateBtn, false);
    }
  });

  // Revoke License Key
  async function revokeKey(key) {
    const secret = sessionStorage.getItem('admin_secret');
    if (!secret) return;

    if (!confirm(`Are you sure you want to revoke key: ${key}? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch('/v1/admin/license/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret
        },
        body: JSON.stringify({ licenseKey: key })
      });

      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }

      const data = await res.json();
      if (data.success) {
        showToast(`Key revoked successfully.`, 'success');
        loadRegistry();
      } else {
        showToast(data.error || 'Failed to revoke key.', 'danger');
      }
    } catch {
      showToast('Network error revoking key.', 'danger');
    }
  }

  // --- UI RENDERING ---

  // Render licenses list with filter/search options
  function renderRegistry() {
    registryList.innerHTML = '';
    const query = searchInput.value.toLowerCase().trim();
    const statusVal = filterStatus.value;

    const filtered = allLicenses.filter(lic => {
      // 1. Search filter
      const matchesSearch = 
        lic.key.toLowerCase().includes(query) ||
        (lic.name && lic.name.toLowerCase().includes(query)) ||
        (lic.email && lic.email.toLowerCase().includes(query));

      // 2. Status filter
      let matchesStatus = true;
      const isExpired = lic.expires_at !== null && Date.now() > lic.expires_at;
      
      if (statusVal === 'active') {
        matchesStatus = (lic.status === 'active' && !isExpired);
      } else if (statusVal === 'revoked') {
        matchesStatus = (lic.status === 'revoked');
      } else if (statusVal === 'expired') {
        matchesStatus = (lic.status === 'expired' || (lic.status === 'active' && isExpired));
      }

      return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      tableContainer.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tableContainer.classList.remove('hidden');

    filtered.forEach(lic => {
      const tr = document.createElement('tr');

      // Key cell
      const tdKey = document.createElement('td');
      tdKey.className = 'key-column';
      tdKey.innerHTML = `
        <span class="key-text">${lic.key}</span>
        <button class="icon-btn copy-btn" title="Copy to clipboard">📋</button>
      `;
      tdKey.querySelector('.copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(lic.key);
        showToast('Key copied to clipboard!', 'success');
      });

      // User details cell
      const tdUser = document.createElement('td');
      if (lic.name || lic.email) {
        tdUser.innerHTML = `
          <div class="user-name">${lic.name || 'No Name'}</div>
          <div class="user-email">${lic.email || 'No Email'}</div>
        `;
      } else {
        tdUser.innerHTML = `<span class="user-anonymous">Anonymous</span>`;
      }

      // Tier cell
      const tdTier = document.createElement('td');
      const tierClass = lic.tier.toLowerCase() === 'enterprise' ? 'enterprise' : 'pro';
      tdTier.innerHTML = `<span class="tier-badge ${tierClass}">${lic.tier}</span>`;

      // Status cell
      const tdStatus = document.createElement('td');
      const isExpired = lic.expires_at !== null && Date.now() > lic.expires_at;
      let displayStatus = lic.status;
      if (lic.status === 'active' && isExpired) {
        displayStatus = 'expired';
      }
      tdStatus.innerHTML = `
        <span class="badge ${displayStatus}">
          <span class="badge-dot"></span>
          ${displayStatus.toUpperCase()}
        </span>
      `;

      // Validity cell
      const tdValidity = document.createElement('td');
      const createdStr = new Date(lic.created_at).toLocaleDateString();
      const expiresStr = lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Lifetime';
      tdValidity.innerHTML = `
        <div class="date-text">Created: ${createdStr}</div>
        <div class="date-text">Expires: ${expiresStr}</div>
      `;

      // Actions cell
      const tdActions = document.createElement('td');
      const btnRevoke = document.createElement('button');
      btnRevoke.className = 'table-action-btn revoke';
      btnRevoke.textContent = 'Revoke';
      btnRevoke.disabled = (lic.status !== 'active' || isExpired);
      btnRevoke.addEventListener('click', () => revokeKey(lic.key));
      tdActions.appendChild(btnRevoke);

      tr.appendChild(tdKey);
      tr.appendChild(tdUser);
      tr.appendChild(tdTier);
      tr.appendChild(tdStatus);
      tr.appendChild(tdValidity);
      tr.appendChild(tdActions);

      registryList.appendChild(tr);
    });
  }

  // Update Stats Count Cards
  function updateStats() {
    statTotal.textContent = allLicenses.length;
    
    const activeCount = allLicenses.filter(lic => {
      const isExpired = lic.expires_at !== null && Date.now() > lic.expires_at;
      return lic.status === 'active' && !isExpired;
    }).length;
    statActive.textContent = activeCount;

    const revokedCount = allLicenses.filter(lic => {
      const isExpired = lic.expires_at !== null && Date.now() > lic.expires_at;
      return lic.status === 'revoked' || (lic.status === 'active' && isExpired);
    }).length;
    statRevoked.textContent = revokedCount;
  }

  // Handle Search and Filters
  searchInput.addEventListener('input', renderRegistry);
  filterStatus.addEventListener('change', renderRegistry);

  // --- HELPERS ---

  // Handle un-authorization session wipe
  function handleUnauthorized() {
    sessionStorage.removeItem('admin_secret');
    showView('login');
    showToast('Unauthorized: Session cleared.', 'danger');
  }

  // Transition view views
  function showView(viewName) {
    if (viewName === 'login') {
      loginView.classList.add('active');
      dashboardView.classList.remove('active');
    } else {
      loginView.classList.remove('active');
      dashboardView.classList.add('active');
    }
  }

  // Handle Button Spinner Loading States
  function setLoading(buttonEl, isLoading) {
    const label = buttonEl.querySelector('span:not(.spinner)');
    const spinner = buttonEl.querySelector('.spinner');

    if (isLoading) {
      buttonEl.disabled = true;
      spinner.classList.remove('hidden');
      if (label) label.style.opacity = '0.5';
    } else {
      buttonEl.disabled = false;
      spinner.classList.add('hidden');
      if (label) label.style.opacity = '1';
    }
  }

  // Toast Notification System
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button class="toast-close">✕</button>
    `;
    
    // Auto-remove toast after 4 seconds
    const timer = setTimeout(() => {
      removeToast(toast);
    }, 4000);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      removeToast(toast);
    });

    toastContainer.appendChild(toast);
  }

  function removeToast(toast) {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }
});
