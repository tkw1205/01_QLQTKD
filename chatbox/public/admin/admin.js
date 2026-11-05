/**
 * Admin Shared Library - Chatbox Store
 * Handles JWT auth, Socket.IO agent connection, unified layout, notifications & API calls.
 */
(function(window) {
  'use strict';

  const Admin = {
    socket: null,
    currentUser: null,
    waitingCount: 0,

    // ─── Token & Session Management ───
    getToken() {
      return localStorage.getItem('admin_token') ||
             sessionStorage.getItem('admin_token');
    },

    setToken(token) {
      localStorage.setItem('admin_token', token);
    },

    removeToken() {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      sessionStorage.removeItem('admin_token');
    },

    getUser() {
      if (this.currentUser) return this.currentUser;
      const stored = localStorage.getItem('admin_user');
      if (stored) {
        try {
          this.currentUser = JSON.parse(stored);
          return this.currentUser;
        } catch (e) {
          localStorage.removeItem('admin_user');
        }
      }
      return null;
    },

    setUser(user) {
      this.currentUser = user;
      if (user) {
        localStorage.setItem('admin_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('admin_user');
      }
    },

    // ─── Auth Verification & Protection ───
    async checkAuth(requiredRole = null) {
      const token = this.getToken();
      const currentPath = window.location.pathname;

      // On login page
      if (currentPath.endsWith('login.html') || currentPath.endsWith('/admin/login')) {
        if (token) {
          try {
            const data = await this.api('/api/auth/me');
            if (data.success && data.data?.user) {
              const u = data.data.user;
              if (u.role === 'user') {
                this.removeToken();
                return true;
              }
              this.setUser(u);
              if (u.role === 'receptionist') {
                window.location.replace('/admin/appointments.html');
              } else {
                window.location.replace('/admin/dashboard.html');
              }
              return false;
            }
          } catch (e) {
            // ONLY remove token if 401 Unauthorized (expired or invalid token)
            // DO NOT remove token on 429 rate limit or temporary network issues
            if (e.status === 401) {
              this.removeToken();
            }
          }
        }
        return true;
      }

      // On protected admin pages
      if (!token) {
        this.redirectToLogin();
        return false;
      }

      try {
        const data = await this.api('/api/auth/me');
        if (!data.success || !data.data?.user) {
          throw new Error('Chưa đăng nhập');
        }
        const user = data.data.user;

        // Customer accounts (role 'user') are strictly forbidden from admin pages
        if (user.role === 'user') {
          this.removeToken();
          alert('Tài khoản khách hàng không có quyền truy cập trang quản trị!');
          this.redirectToLogin();
          return false;
        }

        // Only allow admin, receptionist, staff
        if (!['admin', 'receptionist', 'staff'].includes(user.role)) {
          this.removeToken();
          alert('Bạn không có quyền truy cập trang quản trị!');
          this.redirectToLogin();
          return false;
        }

        this.setUser(user);

        if (requiredRole === 'admin' && user.role !== 'admin') {
          this.toast('Bạn không có quyền truy cập trang này!', 'error');
          setTimeout(() => {
            if (user.role === 'receptionist') {
              window.location.replace('/admin/appointments.html');
            } else {
              window.location.replace('/admin/dashboard.html');
            }
          }, 1200);
          return false;
        }

        // Role-based page access for receptionist: appointments.html, staff.html (Schedule) and chat.html are allowed
        if (user.role === 'receptionist' && !currentPath.endsWith('appointments.html') && !currentPath.endsWith('staff.html') && !currentPath.endsWith('chat.html')) {
          this.toast('Nhân viên lễ tân chỉ được quyền truy cập Lịch hẹn, Lịch làm việc và Chat!', 'info');
          setTimeout(() => {
            window.location.replace('/admin/appointments.html');
          }, 800);
          return false;
        }

        return user;
      } catch (err) {
        console.warn('Auth check failed:', err.message);
        // CRITICAL FIX: Only remove token and redirect on clear 401 Unauthorized!
        // DO NOT remove valid token on 429 (Too many requests) or network/temporary server error.
        if (err.status === 401) {
          this.removeToken();
          this.redirectToLogin();
          return false;
        }

        // Handle 429 or network errors gracefully using cached user data
        const cachedUser = this.getUser();
        if (cachedUser) {
          if (err.status === 429) {
            this.toast('Quá nhiều yêu cầu đến máy chủ. Đang duy trì phiên làm việc.', 'warning');
          } else {
            this.toast('Không thể kết nối máy chủ, đang giữ phiên đăng nhập...', 'warning');
          }
          return cachedUser;
        }

        return false;
      }
    },

    redirectToLogin() {
      const target = '/admin/login.html';
      if (!window.location.pathname.endsWith('login.html')) {
        window.location.replace(target);
      }
    },

    // ─── API Helper ───
    async api(endpoint, options = {}) {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const config = {
        credentials: 'same-origin',
        ...options,
        headers
      };

      if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
      }

      try {
        const res = await fetch(endpoint, config);
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          if (token && endpoint !== '/api/auth/login') {
            this.removeToken();
            this.redirectToLogin();
          }
          const err = new Error(data.error || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
          err.status = 401;
          err.data = data;
          throw err;
        }

        if (!res.ok) {
          const err = new Error(data.error || `Yêu cầu thất bại (${res.status})`);
          err.status = res.status;
          err.data = data;
          throw err;
        }

        return data;
      } catch (err) {
        console.error(`[Admin API Error] ${endpoint}:`, err);
        throw err;
      }
    },

    // ─── Toggle Availability ───
    async toggleAvailability(isAvailable) {
      try {
        const res = await this.api('/api/auth/availability', {
          method: 'PUT',
          body: { isAvailable }
        });
        if (res.success && this.currentUser) {
          this.currentUser.is_available = isAvailable;
          this.setUser(this.currentUser);
          this.toast(isAvailable ? 'Đã bật chế độ sẵn sàng tiếp khách' : 'Đã tạm dừng tiếp khách', 'success');
          return true;
        }
      } catch (err) {
        this.toast(err.message || 'Không thể cập nhật trạng thái', 'error');
        return false;
      }
    },

    // ─── Logout ───
    async logout() {
      try {
        await this.api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      } finally {
        if (this.socket) {
          this.socket.disconnect();
          this.socket = null;
        }
        this.removeToken();
        window.location.replace('/admin/login.html');
      }
    },

    // ─── Web Audio Chime ───
    playNotificationSound() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.12); // A5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
      } catch (e) {
        // Audio might be blocked until user interacts
      }
    },

    // ─── Socket.IO Agent Connection ───
    initSocket() {
      const token = this.getToken();
      if (!token || typeof io === 'undefined') return;

      if (this.socket && this.socket.connected) return;

      this.socket = io({
        auth: { token },
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
      });

      this.socket.on('connect', () => {
        console.log('[Admin Socket] Connected as agent:', this.currentUser?.name);
        this.fetchWaitingBadgeCount();
        this.fetchNotificationUnreadCount();
      });

      this.socket.on('new_notification', (data) => {
        console.log('[Admin Socket] New notification received:', data);
        this.playNotificationSound();
        if (data && data.unreadCount !== undefined) {
          this.setNotificationBadge(data.unreadCount);
        } else {
          this.fetchNotificationUnreadCount();
        }
        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown && dropdown.classList.contains('show')) {
          this.fetchNotificationsList();
        }
        if (data && data.notification) {
          const custName = data.notification.customer_name || 'Khách hàng';
          const msgPreview = (data.notification.last_message || '').substring(0, 50);
          this.toast(`🔔 ${custName}: ${msgPreview}`, 'info');
        }
      });

      this.socket.on('new_waiting_conversation', (data) => {
        console.log('[Admin Socket] New waiting conversation:', data);
        this.playNotificationSound();
        this.toast(`🔔 Cuộc hội thoại mới đang chờ: ${data.customerName || 'Khách vãng lai'}`, 'warning');
        this.updateWaitingBadge(1, true);

        // Dispatch window event so chat.html can re-fetch
        window.dispatchEvent(new CustomEvent('admin:new_waiting', { detail: data }));
      });

      this.socket.on('conversation_claimed', (data) => {
        console.log('[Admin Socket] Conversation claimed:', data);
        this.updateWaitingBadge(-1, true);
        window.dispatchEvent(new CustomEvent('admin:claimed', { detail: data }));
      });

      this.socket.on('conversation_closed', (data) => {
        window.dispatchEvent(new CustomEvent('admin:closed', { detail: data }));
      });

      this.socket.on('conversation_mode_changed', (data) => {
        console.log('[Admin Socket] Conversation mode changed:', data);
        window.dispatchEvent(new CustomEvent('admin:mode_changed', { detail: data }));
      });

      this.socket.on('mode_changed', (data) => {
        window.dispatchEvent(new CustomEvent('admin:mode_changed', { detail: data }));
      });

      this.socket.on('new_message', (data) => {
        window.dispatchEvent(new CustomEvent('admin:new_message', { detail: data }));
      });

      this.socket.on('conversation_read', (data) => {
        window.dispatchEvent(new CustomEvent('admin:conversation_read', { detail: data }));
      });
    },

    async fetchWaitingBadgeCount() {
      try {
        const res = await this.api('/api/conversations/agent/waiting');
        if (res.success && Array.isArray(res.data)) {
          this.setWaitingBadge(res.data.length);
        }
      } catch (e) {
        // silently ignore on initial load
      }
    },

    setWaitingBadge(count) {
      this.waitingCount = Math.max(0, count);
      const el = document.getElementById('sidebar-waiting-badge');
      if (el) {
        if (this.waitingCount > 0) {
          el.textContent = this.waitingCount;
          el.style.display = 'inline-block';
        } else {
          el.style.display = 'none';
        }
      }
    },

    updateWaitingBadge(delta, relative = false) {
      const current = this.waitingCount || 0;
      this.setWaitingBadge(relative ? current + delta : delta);
    },

    // ─── Format Helpers ───
    formatCurrency(amount) {
      if (amount == null || isNaN(amount)) return '0 ₫';
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    },

    formatDate(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    formatTime(timeStr) {
      if (!timeStr) return '—';
      return timeStr.slice(0, 5);
    },

    formatDateTime(dateStr) {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${mins} ${day}/${month}/${year}`;
    },

    timeAgo(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const seconds = Math.floor((new Date() - d) / 1000);
      if (seconds < 30) return 'Vừa xong';
      if (seconds < 60) return `${seconds}s trước`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes} phút trước`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} giờ trước`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days} ngày trước`;
      return this.formatDate(dateStr);
    },

    // ─── Toast System ───
    toast(message, type = 'info') {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      
      const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
      toast.innerHTML = `
        <span style="font-size: 1.1rem; line-height: 1;">${icon}</span>
        <div style="flex: 1; word-break: break-word;">${message}</div>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    },

    // ─── Confirm Modal Helper ───
    confirmModal({ title = 'Xác nhận', message = 'Bạn có chắc chắn?', confirmText = 'Đồng ý', cancelText = 'Hủy', confirmType = 'primary', onConfirm }) {
      let overlay = document.getElementById('admin-confirm-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'admin-confirm-modal';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
          <div class="modal" style="max-width: 440px;">
            <div class="modal-header">
              <h3 id="admin-confirm-title" style="font-size: 1.1rem;">${title}</h3>
              <button type="button" class="modal-close" id="admin-confirm-close">&times;</button>
            </div>
            <div class="modal-body" id="admin-confirm-body" style="font-size: .95rem; color: var(--text-muted);">
              ${message}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline btn-sm" id="admin-confirm-cancel">${cancelText}</button>
              <button type="button" class="btn btn-${confirmType} btn-sm" id="admin-confirm-btn">${confirmText}</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
      } else {
        document.getElementById('admin-confirm-title').textContent = title;
        document.getElementById('admin-confirm-body').innerHTML = message;
        const confirmBtn = document.getElementById('admin-confirm-btn');
        confirmBtn.className = `btn btn-${confirmType} btn-sm`;
        confirmBtn.textContent = confirmText;
        document.getElementById('admin-confirm-cancel').textContent = cancelText;
      }

      overlay.classList.add('open');

      const close = () => {
        overlay.classList.remove('open');
      };

      const btnClose = document.getElementById('admin-confirm-close');
      const btnCancel = document.getElementById('admin-confirm-cancel');
      const btnOk = document.getElementById('admin-confirm-btn');

      btnClose.onclick = close;
      btnCancel.onclick = close;
      overlay.onclick = (e) => {
        if (e.target === overlay) close();
      };
      btnOk.onclick = async () => {
        close();
        if (typeof onConfirm === 'function') {
          await onConfirm();
        }
      };
    },

    // ─── Render Unified Sidebar & Header Layout ───
    initLayout(activeMenuKey, pageTitle = '') {
      const user = this.getUser() || { name: 'Quản trị viên', role: 'admin', is_available: true };
      const isAdmin = user.role === 'admin';
      const isReceptionist = user.role === 'receptionist';

      // 1. Top Navigation Bar (#side / .admin-sidebar)
      const sidebarHtml = `
        <div class="side-inner">
          <div class="logo-wrap">
            <button type="button" class="sidebar-toggle" title="Menu">☰</button>
            <a href="/admin/dashboard.html" class="logo">Mây Hair Studio</a>
          </div>
          
          <nav class="nv-list">
            ${isReceptionist ? `
              <a href="/admin/appointments.html" class="nv ${activeMenuKey === 'appointments' ? 'on' : ''}">Quản lý lịch hẹn</a>
              <a href="/admin/staff.html" class="nv ${activeMenuKey === 'staff' ? 'on' : ''}">Lịch làm việc &amp; Phân công</a>
              <a href="/admin/chat.html" class="nv ${activeMenuKey === 'chat' ? 'on' : ''}" style="position: relative;">
                Theo dõi chat
                <span id="sidebar-waiting-badge" class="bd s2" style="margin-left: 6px; display: none; padding: 1px 7px; font-size: 11px;">0</span>
              </a>
            ` : `
              <a href="/admin/dashboard.html" class="nv ${activeMenuKey === 'dashboard' ? 'on' : ''}">Tổng quan</a>
              <a href="/admin/appointments.html" class="nv ${activeMenuKey === 'appointments' ? 'on' : ''}">Quản lý lịch hẹn</a>
              <a href="/admin/staff.html" class="nv ${activeMenuKey === 'staff' ? 'on' : ''}">Lịch làm việc &amp; Phân công</a>
              <a href="/admin/products.html" class="nv ${activeMenuKey === 'products' ? 'on' : ''}">Quản lý dịch vụ</a>
              <a href="/admin/chat.html" class="nv ${activeMenuKey === 'chat' ? 'on' : ''}" style="position: relative;">
                Theo dõi chat
                <span id="sidebar-waiting-badge" class="bd s2" style="margin-left: 6px; display: none; padding: 1px 7px; font-size: 11px;">0</span>
              </a>

              ${isAdmin ? `
                <a href="/admin/settings.html" class="nv ${activeMenuKey === 'settings' ? 'on' : ''}">Cài đặt</a>
              ` : ''}
            `}

            <a href="/" target="_blank" class="nv nv-store">Cửa hàng ↗</a>
          </nav>

          <div class="who">
            ${!isReceptionist ? `
            <div class="avail-wrap" title="Bật/tắt trạng thái sẵn sàng tiếp khách">
              <label class="toggle">
                <input type="checkbox" id="toggle-availability" ${user.is_available ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              <span id="status-label" class="status-txt">${user.is_available ? 'Sẵn sàng' : 'Bận'}</span>
            </div>
            ` : ''}

            <div class="bw notif-bell-wrapper" id="notif-bell-wrapper">
              <button type="button" class="bell notif-bell-btn" id="notif-bell-btn" title="Thông báo" aria-label="Thông báo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>
                </svg>
                <i class="notif-badge" id="notif-badge" style="display: none;">0</i>
              </button>
              <div class="np notif-dropdown" id="notif-dropdown">
                <h4>
                  <span>Thông báo</span>
                  <button type="button" class="btn ghost sm notif-mark-all-btn" id="notif-mark-all-btn">Đánh dấu đã đọc</button>
                </h4>
                <div class="notif-body" id="notif-list-body">
                  <div class="notif-empty" style="padding: 16px; color: var(--mut); text-align: center;">Chưa có thông báo.</div>
                </div>
                <div class="notif-footer">
                  <a href="/admin/chat.html" class="notif-view-all">Xem tất cả tại Trực chat &rarr;</a>
                </div>
              </div>
            </div>

            <div class="user-info">
              <b>${this.escapeHtml(user.name || 'Quản lý')}</b> · <span>${user.role === 'admin' ? 'Chủ tiệm' : user.role === 'receptionist' ? 'Lễ tân' : 'Nhân viên'}</span>
            </div>

            <button type="button" class="btn ghost sm btn-trigger-logout" id="btn-admin-logout" title="Đăng xuất">Đăng xuất</button>
          </div>
        </div>
      `;

      const sidebarEl = document.getElementById('admin-sidebar');
      if (sidebarEl) {
        sidebarEl.innerHTML = sidebarHtml;
      }

      // 2. Attach toggle availability listener
      const toggleAvail = document.getElementById('toggle-availability');
      if (toggleAvail) {
        toggleAvail.addEventListener('change', async (e) => {
          const checked = e.target.checked;
          const ok = await this.toggleAvailability(checked);
          if (ok) {
            const dot = document.getElementById('status-dot');
            const lbl = document.getElementById('status-label');
            if (dot) dot.className = `online-dot ${checked ? '' : 'offline'}`;
            if (lbl) lbl.textContent = checked ? 'Sẵn sàng' : 'Bận';
          } else {
            e.target.checked = !checked;
          }
        });
      }

      // 3. Attach logout listener
      document.querySelectorAll('.btn-trigger-logout').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.confirmModal({
            title: 'Đăng xuất',
            message: 'Bạn có chắc chắn muốn đăng xuất khỏi trang quản trị?',
            confirmText: 'Đăng xuất',
            confirmType: 'danger',
            onConfirm: () => this.logout()
          });
        });
      });

      // 4. Mobile sidebar toggle
      const toggleBtn = document.querySelector('.sidebar-toggle');
      if (toggleBtn && sidebarEl) {
        toggleBtn.addEventListener('click', () => {
          sidebarEl.classList.toggle('open');
        });

        // Close on click outside on mobile
        document.addEventListener('click', (e) => {
          if (window.innerWidth <= 1024 &&
              sidebarEl.classList.contains('open') &&
              !sidebarEl.contains(e.target) &&
              !toggleBtn.contains(e.target)) {
            sidebarEl.classList.remove('open');
          }
        });
      }

      // 5. Notification bell system
      this.initNotificationSystem();

      // 6. Connect Socket.IO
      this.initSocket();
    },

    // ─── Notification System ───
    unreadNotificationsCount: 0,
    notificationsList: [],
    notificationPollTimer: null,

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    initNotificationSystem() {
      let bellBtn = document.getElementById('notif-bell-btn');
      let dropdown = document.getElementById('notif-dropdown');
      let btnMarkAll = document.getElementById('notif-mark-all-btn');

      if (!bellBtn || !dropdown) {
        const header = document.querySelector('.admin-header');
        if (!header) return;

        // Locate container for header actions
        let targetContainer = header.querySelector('.header-actions');
        if (!targetContainer) {
          const childDivs = Array.from(header.children).filter(el => el.tagName === 'DIV');
          if (childDivs.length >= 2) {
            targetContainer = childDivs[childDivs.length - 1];
          } else {
            targetContainer = document.createElement('div');
            targetContainer.className = 'header-actions';
            targetContainer.style.display = 'flex';
            targetContainer.style.alignItems = 'center';
            targetContainer.style.gap = '.75rem';
            header.appendChild(targetContainer);
          }
        }

        // Create Bell & Dropdown DOM
        const bellWrapper = document.createElement('div');
        bellWrapper.className = 'bw notif-bell-wrapper';
        bellWrapper.id = 'notif-bell-wrapper';
        bellWrapper.innerHTML = `
          <button type="button" class="bell notif-bell-btn" id="notif-bell-btn" title="Thông báo tin nhắn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>
            </svg>
            <i class="notif-badge" id="notif-badge" style="display: none;">0</i>
          </button>
          <div class="np notif-dropdown" id="notif-dropdown">
            <h4>
              <span>Thông báo tin nhắn</span>
              <button type="button" class="btn ghost sm notif-mark-all-btn" id="notif-mark-all-btn">Đánh dấu tất cả đã đọc</button>
            </h4>
            <div class="notif-body" id="notif-list-body">
              <div class="notif-empty">Đang tải thông báo...</div>
            </div>
            <div class="notif-footer">
              <a href="/admin/chat.html" class="notif-view-all">Đi đến phòng trực chat &rarr;</a>
            </div>
          </div>
        `;

        targetContainer.insertBefore(bellWrapper, targetContainer.firstChild);

        bellBtn = document.getElementById('notif-bell-btn');
        dropdown = document.getElementById('notif-dropdown');
        btnMarkAll = document.getElementById('notif-mark-all-btn');
      }

      if (bellBtn && dropdown && !bellBtn.dataset.bound) {
        bellBtn.dataset.bound = 'true';

        // Toggle dropdown
        bellBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = dropdown.classList.toggle('show');
          if (isOpen) {
            this.fetchNotificationsList();
          }
        });

        // Stop propagation inside dropdown
        dropdown.addEventListener('click', (e) => {
          e.stopPropagation();
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => {
          if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
          }
        });

        // Mark all as read button
        if (btnMarkAll) {
          btnMarkAll.addEventListener('click', (e) => {
            e.stopPropagation();
            this.markAllNotificationsAsRead();
          });
        }
      }

      // Initial unread count fetch
      this.fetchNotificationUnreadCount();

      // Fallback polling every 10 seconds
      if (!this.notificationPollTimer) {
        this.notificationPollTimer = setInterval(() => {
          this.fetchNotificationUnreadCount();
        }, 10000);
      }
    },

    async fetchNotificationUnreadCount() {
      try {
        const res = await this.api('/api/admin/notifications/unread-count');
        if (res.success && res.data) {
          const count = res.data.count ?? res.unreadCount ?? 0;
          this.setNotificationBadge(count);
        }
      } catch (err) {
        // silent ignore
      }
    },

    setNotificationBadge(count) {
      this.unreadNotificationsCount = Math.max(0, count);
      const badge = document.getElementById('notif-badge');
      const tag = document.getElementById('notif-unread-tag');
      const bellBtn = document.getElementById('notif-bell-btn');
      if (badge) {
        if (this.unreadNotificationsCount > 0) {
          badge.textContent = this.unreadNotificationsCount > 99 ? '99+' : this.unreadNotificationsCount;
          badge.style.display = 'inline-flex';
          if (bellBtn) {
            bellBtn.classList.add('has-new');
            setTimeout(() => bellBtn.classList.remove('has-new'), 800);
          }
        } else {
          badge.style.display = 'none';
        }
      }
      if (tag) {
        tag.textContent = `${this.unreadNotificationsCount} mới`;
      }
    },

    async fetchNotificationsList() {
      const body = document.getElementById('notif-list-body');
      if (!body) return;
      try {
        const res = await this.api('/api/admin/notifications?limit=30');
        if (!res.success) throw new Error('Không thể tải thông báo');
        this.notificationsList = res.data || [];
        this.renderNotificationsList(this.notificationsList);
      } catch (err) {
        body.innerHTML = `<div class="notif-empty" style="color: var(--danger);">✕ Lỗi: ${this.escapeHtml(err.message)}</div>`;
      }
    },

    renderNotificationsList(list) {
      const body = document.getElementById('notif-list-body');
      if (!body) return;
      if (!list || list.length === 0) {
        body.innerHTML = `
          <div class="notif-empty">
            <div style="font-size: 1.8rem; margin-bottom: .35rem;">🔕</div>
            <div>Chưa có thông báo nào</div>
          </div>
        `;
        return;
      }

      body.innerHTML = list.map(n => {
        const isUnread = !n.is_read;
        const name = n.customer_name || 'Khách hàng';
        const initial = (name.trim().charAt(0) || 'K').toUpperCase();
        const time = this.timeAgo(n.created_at);
        const msg = n.last_message || 'Đã gửi tin nhắn';

        return `
          <div class="notif-item ${isUnread ? 'is-unread' : ''}" data-id="${n.id}" data-conv-id="${n.conversation_id}">
            <div class="notif-avatar">${this.escapeHtml(initial)}</div>
            <div class="notif-content">
              <div class="notif-top">
                <span class="notif-name" title="${this.escapeHtml(name)}">${this.escapeHtml(name)}</span>
                <span class="notif-time">${time}</span>
              </div>
              <div class="notif-msg" title="${this.escapeHtml(msg)}">${this.escapeHtml(msg)}</div>
            </div>
            ${isUnread ? '<span class="notif-dot" title="Chưa đọc"></span>' : ''}
          </div>
        `;
      }).join('');

      body.querySelectorAll('.notif-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
          const id = itemEl.getAttribute('data-id');
          const convId = itemEl.getAttribute('data-conv-id');
          this.onNotificationItemClick(id, convId);
        });
      });
    },

    async onNotificationItemClick(id, conversationId) {
      // Optimistically mark as read in local array
      if (this.notificationsList) {
        const target = this.notificationsList.find(n => n.id === id);
        if (target && !target.is_read) {
          target.is_read = true;
          this.renderNotificationsList(this.notificationsList);
          this.setNotificationBadge(Math.max(0, this.unreadNotificationsCount - 1));
        }
      }

      // Mark as read on server
      try {
        await this.api(`/api/admin/notifications/${id}/read`, { method: 'PUT' });
        this.fetchNotificationUnreadCount();
      } catch (e) {
        console.warn('Failed to mark notification as read:', e);
      }

      // Close dropdown
      const dropdown = document.getElementById('notif-dropdown');
      if (dropdown) dropdown.classList.remove('show');

      // Navigate to chat.html and auto-select
      const currentPath = window.location.pathname;
      if (currentPath.endsWith('chat.html') || currentPath.endsWith('/admin/chat')) {
        window.dispatchEvent(new CustomEvent('admin:select_conversation', { detail: { conversationId } }));
      } else {
        window.location.href = `/admin/chat.html?conversationId=${encodeURIComponent(conversationId)}`;
      }
    },

    async markAllNotificationsAsRead() {
      try {
        const res = await this.api('/api/admin/notifications/read-all', { method: 'PUT' });
        if (res.success) {
          this.setNotificationBadge(0);
          this.toast('Đã đánh dấu tất cả thông báo là đã đọc', 'success');
          if (this.notificationsList && this.notificationsList.length) {
            this.notificationsList.forEach(n => { n.is_read = true; });
            this.renderNotificationsList(this.notificationsList);
          }
        }
      } catch (err) {
        this.toast('Không thể đánh dấu tất cả đã đọc', 'error');
      }
    }
  };

  window.Admin = Admin;
})(window);
