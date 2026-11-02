// API client & helper utilities
const API = {
  // ─── Customer Token & Session Management ───
  getCustomerToken() {
    return localStorage.getItem('customer_token') || sessionStorage.getItem('customer_token');
  },

  setCustomerToken(token) {
    if (token) {
      localStorage.setItem('customer_token', token);
    } else {
      this.removeCustomerToken();
    }
  },

  removeCustomerToken() {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_user');
    sessionStorage.removeItem('customer_token');
  },

  getCustomerUser() {
    const stored = localStorage.getItem('customer_user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        localStorage.removeItem('customer_user');
      }
    }
    return null;
  },

  setCustomerUser(user) {
    if (user) {
      localStorage.setItem('customer_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('customer_user');
    }
  },

  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    const customerToken = this.getCustomerToken();
    if (customerToken) {
      defaultHeaders['Authorization'] = `Bearer ${customerToken}`;
    }

    const config = {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(endpoint, config);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `Lỗi máy chủ (${res.status})`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  formatCurrency(amount) {
    if (amount == null) return 'Liên hệ';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  },

  formatProductPrice(product) {
    if (!product?.prices_by_size) return this.formatCurrency(product?.price);
    const unit = product.price_unit === 'per_tap' ? '/tép' : '';
    return ['S', 'M', 'L']
      .filter(size => product.prices_by_size[size]?.price != null)
      .map(size => `${size}: ${this.formatCurrency(product.prices_by_size[size].price)}${unit}`)
      .join(' · ') || 'Liên hệ';
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN');
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <div>${message}</div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

window.API = API;
