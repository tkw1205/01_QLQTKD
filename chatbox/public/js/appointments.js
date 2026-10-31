// public/js/appointments.js - Client logic for appointments booking & lookup

let currentUser = null;

function getStatusBadge(status) {
  switch (status) {
    case 'confirmed': return '<span class="badge badge-success">Đã xác nhận</span>';
    case 'holding': return '<span class="badge badge-warning">Đang giữ chỗ</span>';
    case 'pending': return '<span class="badge badge-warning">Đang chờ xử lý</span>';
    case 'in_progress': return '<span class="badge badge-info">Đang phục vụ</span>';
    case 'completed': return '<span class="badge badge-info">Đã hoàn thành</span>';
    case 'cancelled': return '<span class="badge badge-danger">Đã hủy</span>';
    case 'no_show': return '<span class="badge badge-secondary">Vắng mặt</span>';
    default: return `<span class="badge badge-secondary">${status || 'Không xác định'}</span>`;
  }
}

// ─── Render Lookup Card Details ───
function renderAppointmentDetails(a, containerId = 'lookup-result') {
  const resultDiv = document.getElementById(containerId);
  if (!resultDiv) return;

  const emailDisplay = a.customer_email
    ? `<span>${a.customer_email}</span>`
    : '<span class="text-muted" style="font-style: italic;">Không cung cấp (Không bắt buộc)</span>';

  resultDiv.innerHTML = `
    <div class="card p-3" style="background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); margin-top: 1rem;">
      <div class="flex-between mb-2">
        <h4 style="margin: 0; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>📋 Chi Tiết Lịch Hẹn</span>
          ${a.booking_code ? `<span class="badge badge-primary" style="font-family: monospace; font-size: 0.85rem;">${a.booking_code}</span>` : ''}
        </h4>
        ${getStatusBadge(a.status)}
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.5rem 1rem; margin-top: 0.75rem; font-size: 0.9rem;">
        <div><strong>Họ và tên:</strong> ${a.customer_name || 'Khách hàng'}</div>
        <div><strong>Số điện thoại:</strong> ${a.customer_phone || '-'}</div>
        <div><strong>Địa chỉ Email:</strong> ${emailDisplay}</div>
        <div><strong>Dịch vụ / Sản phẩm:</strong> ${a.product_name || 'Tư vấn chung'}</div>
        <div><strong>Ngày hẹn:</strong> ${API.formatDate(a.appointment_date)}</div>
        <div><strong>Giờ hẹn:</strong> ${API.formatTime(a.appointment_time)} (${a.duration_minutes || 30} phút)</div>
        ${a.notes ? `<div style="grid-column: 1 / -1;"><strong>Ghi chú:</strong> ${a.notes}</div>` : ''}
      </div>

      ${a.status !== 'cancelled' && a.status !== 'completed' ? `
        <div class="mt-3 text-right" style="border-top: 1px dashed var(--border); padding-top: 0.75rem;">
          <button class="btn btn-sm btn-danger" onclick="cancelAppointment('${a.id}')">Hủy lịch hẹn này</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Check User Auth & Autofill Form ───
async function checkUserAuth() {
  const banner = document.getElementById('auth-status-banner');
  const authNav = document.getElementById('auth-nav-item');
  const nameInput = document.getElementById('book-name');
  const phoneInput = document.getElementById('book-phone');
  const emailInput = document.getElementById('book-email');

  const token = API.getCustomerToken();
  if (!token) {
    currentUser = null;
    if (banner) banner.style.display = 'none';
    if (authNav) authNav.innerHTML = `<button id="btn-open-auth" class="btn btn-sm btn-outline" onclick="openAuthModal()">Đăng nhập / Đăng ký</button>`;
    const savedName = localStorage.getItem('chatbox_saved_name');
    const savedPhone = localStorage.getItem('chatbox_saved_phone');
    const savedEmail = localStorage.getItem('chatbox_saved_email');
    if (savedName && nameInput && !nameInput.value) nameInput.value = savedName;
    if (savedPhone && phoneInput && !phoneInput.value) phoneInput.value = savedPhone;
    if (savedEmail && emailInput && !emailInput.value) emailInput.value = savedEmail;
    const tableTitle = document.getElementById('table-title');
    const tableSub = document.getElementById('table-sub-title');
    if (tableTitle) tableTitle.textContent = 'Lịch Hẹn Của Bạn';
    if (tableSub) tableSub.textContent = 'Danh sách lịch hẹn trong phiên hoặc tài khoản';
    return;
  }

  try {
    const res = await API.get('/api/auth/me');
    if (res.success && res.data && res.data.user && res.data.user.role === 'user') {
      currentUser = res.data.user;
      API.setCustomerUser(currentUser);
      if (banner) {
        banner.style.display = 'flex';
        const welcomeText = document.getElementById('auth-welcome-text');
        if (welcomeText) welcomeText.innerHTML = `Xin chào, <strong>${currentUser.name || currentUser.email}</strong> (${currentUser.email})`;
      }
      if (authNav) {
        authNav.innerHTML = `
          <div style="display: flex; align-items: center; gap: .5rem;">
            <span style="font-size: .85rem; font-weight: 600; color: var(--primary);">👤 ${currentUser.name || 'Khách'}</span>
            <button onclick="logoutUser()" class="btn btn-sm btn-outline" style="padding: 2px 8px; font-size: .75rem;">Thoát</button>
          </div>
        `;
      }

      if (nameInput && !nameInput.value && currentUser.name) nameInput.value = currentUser.name;
      if (phoneInput && !phoneInput.value && currentUser.phone) phoneInput.value = currentUser.phone;
      if (emailInput && !emailInput.value && currentUser.email) emailInput.value = currentUser.email;

      const tableTitle = document.getElementById('table-title');
      const tableSub = document.getElementById('table-sub-title');
      if (tableTitle) tableTitle.textContent = 'Lịch Hẹn Của Tài Khoản';
      if (tableSub) tableSub.textContent = 'Tất cả các lịch hẹn đã liên kết với tài khoản của bạn';
      return;
    } else {
      API.removeCustomerToken();
      currentUser = null;
    }
  } catch (e) {
    if (e.status === 401) {
      API.removeCustomerToken();
      currentUser = null;
    }
  }

  currentUser = null;
  if (banner) banner.style.display = 'none';
  if (authNav) authNav.innerHTML = `<button id="btn-open-auth" class="btn btn-sm btn-outline" onclick="openAuthModal()">Đăng nhập / Đăng ký</button>`;
  const savedName = localStorage.getItem('chatbox_saved_name');
  const savedPhone = localStorage.getItem('chatbox_saved_phone');
  const savedEmail = localStorage.getItem('chatbox_saved_email');
  if (savedName && nameInput && !nameInput.value) nameInput.value = savedName;
  if (savedPhone && phoneInput && !phoneInput.value) phoneInput.value = savedPhone;
  if (savedEmail && emailInput && !emailInput.value) emailInput.value = savedEmail;
}

// ─── Load Products for dropdown ───
async function loadProductsDropdown() {
  try {
    const res = await API.get('/api/products?limit=50');
    if (res.success && res.data) {
      const select = document.getElementById('book-product');
      if (!select) return;
      res.data.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${API.formatCurrency(p.price)})`;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.warn('Could not load products for select', err);
  }
}

// ─── Load Available Slots ───
async function loadAvailableSlots(date) {
  const timeSelect = document.getElementById('book-time');
  if (!timeSelect) return;
  if (!date) {
    timeSelect.innerHTML = '<option value="">Chọn ngày trước</option>';
    return;
  }

  timeSelect.innerHTML = '<option value="">Đang tải khung giờ...</option>';
  try {
    const res = await API.get(`/api/appointments/slots?date=${encodeURIComponent(date)}`);
    if (res.success && res.data && res.data.slots) {
      const slots = res.data.slots;
      if (slots.length === 0) {
        timeSelect.innerHTML = '<option value="">Hết khung giờ trống trong ngày này</option>';
        return;
      }
      timeSelect.innerHTML = '<option value="">-- Chọn khung giờ tư vấn --</option>' +
        slots.map(s => `<option value="${s}">${s}</option>`).join('');
    }
  } catch (err) {
    timeSelect.innerHTML = `<option value="">Lỗi: ${err.message || 'Không thể lấy giờ'}</option>`;
  }
}

// ─── Submit Booking Form (Optional Email) ───
async function handleBookingSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-booking');
  const name = document.getElementById('book-name').value.trim();
  const phone = document.getElementById('book-phone').value.trim();
  const email = document.getElementById('book-email').value.trim(); // Optional!
  const productId = document.getElementById('book-product').value;
  const date = document.getElementById('book-date').value;
  const time = document.getElementById('book-time').value;
  const notes = document.getElementById('book-notes').value.trim();

  if (!name || !phone || !date || !time) {
    API.showToast('Vui lòng điền đầy đủ các trường bắt buộc (Họ tên, SĐT, Ngày hẹn, Giờ hẹn)!', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Đang xử lý đặt lịch...';

  try {
    const res = await API.post('/api/appointments', {
      customerName: name,
      customerPhone: phone,
      customerEmail: email || null, // Convert empty string to null
      productId: productId || null,
      appointmentDate: date,
      appointmentTime: time,
      notes: notes || null,
    });

    if (res.success && res.data) {
      const appt = res.data;
      const bookingCodeMsg = appt.booking_code ? ` | Mã đặt lịch: ${appt.booking_code}` : '';
      API.showToast(`Đặt lịch hẹn thành công!${bookingCodeMsg}`, 'success');

      localStorage.setItem('chatbox_saved_name', name);
      localStorage.setItem('chatbox_saved_phone', phone);
      if (email) {
        localStorage.setItem('chatbox_saved_email', email);
      }

      document.getElementById('book-time').value = '';
      document.getElementById('book-notes').value = '';

      // Autofill Phone + Booking Code lookup inputs
      const lookupPhoneInput = document.getElementById('lookup-phone');
      const lookupCodeInput = document.getElementById('lookup-booking-code');
      const tokenInput = document.getElementById('token-input');

      if (lookupPhoneInput) lookupPhoneInput.value = phone;
      if (lookupCodeInput && appt.booking_code) lookupCodeInput.value = appt.booking_code;
      if (tokenInput && appt.confirmation_token) tokenInput.value = appt.confirmation_token;

      // Render the booked appointment details in lookup result
      renderAppointmentDetails(appt);
      loadMyAppointments();
    }
  } catch (err) {
    API.showToast(err.message || 'Đặt lịch thất bại. Vui lòng thử lại!', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Xác nhận đặt lịch tư vấn';
  }
}

// ─── Lookup by Phone + Booking Code (CR-01) ───
async function lookupByPhoneAndCode(phoneParam, codeParam) {
  const phone = (phoneParam || document.getElementById('lookup-phone')?.value || '').trim();
  const bookingCode = (codeParam || document.getElementById('lookup-booking-code')?.value || '').trim();
  const resultDiv = document.getElementById('lookup-result');

  if (!phone || !bookingCode) {
    if (resultDiv) {
      resultDiv.innerHTML = '<div class="alert alert-warning">Vui lòng nhập cả Số điện thoại và Mã đặt lịch (booking code) để tra cứu.</div>';
    }
    return;
  }

  if (resultDiv) {
    resultDiv.innerHTML = '<div class="text-muted" style="padding: 0.5rem 0;">Đang tra cứu thông tin lịch hẹn theo số điện thoại và mã đặt lịch...</div>';
  }

  try {
    const res = await API.get(`/api/appointments/lookup?phone=${encodeURIComponent(phone)}&bookingCode=${encodeURIComponent(bookingCode)}`);
    if (res.success && res.data) {
      renderAppointmentDetails(res.data);
    } else {
      if (resultDiv) {
        resultDiv.innerHTML = `<div class="alert alert-danger">${res.error || 'Không tìm thấy lịch hẹn phù hợp.'}</div>`;
      }
    }
  } catch (err) {
    if (resultDiv) {
      resultDiv.innerHTML = `<div class="alert alert-danger">${err.message || 'Không tìm thấy lịch hẹn phù hợp với thông tin đã cung cấp.'}</div>`;
    }
  }
}

// ─── Lookup by Confirmation Token ───
async function lookupByToken(tokenParam) {
  const token = (tokenParam || document.getElementById('token-input')?.value || '').trim();
  const resultDiv = document.getElementById('lookup-result');

  if (!token) {
    if (resultDiv) {
      resultDiv.innerHTML = '<div class="alert alert-warning">Vui lòng nhập mã xác nhận lịch hẹn (Token).</div>';
    }
    return;
  }

  if (resultDiv) {
    resultDiv.innerHTML = '<div class="text-muted" style="padding: 0.5rem 0;">Đang tìm kiếm thông tin lịch hẹn theo mã token...</div>';
  }

  try {
    const res = await API.get(`/api/appointments/lookup/${encodeURIComponent(token)}`);
    if (res.success && res.data) {
      renderAppointmentDetails(res.data);
    } else {
      if (resultDiv) {
        resultDiv.innerHTML = `<div class="alert alert-danger">${res.error || 'Không tìm thấy lịch hẹn.'}</div>`;
      }
    }
  } catch (err) {
    if (resultDiv) {
      resultDiv.innerHTML = `<div class="alert alert-danger">${err.message || 'Không tìm thấy lịch hẹn hoặc bạn không có quyền xem.'}</div>`;
    }
  }
}

// ─── Load Appointments List ───
async function loadMyAppointments() {
  const tbody = document.getElementById('my-appointments-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3 text-muted">Đang tải dữ liệu...</td></tr>';

  try {
    const endpoint = currentUser ? '/api/appointments/my-appointments' : '/api/appointments/my';
    const res = await API.get(endpoint);
    if (res.success && res.data) {
      const list = res.data;
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center p-3 text-muted">
          ${currentUser ? 'Tài khoản của bạn chưa có lịch hẹn nào. Hãy sử dụng biểu mẫu phía trên để đặt lịch tư vấn!' : 'Bạn chưa tạo lịch hẹn nào trong phiên này. Hãy đặt lịch tư vấn ở biểu mẫu phía trên!'}
        </td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(a => `
        <tr>
          <td><strong>${a.customer_name}</strong></td>
          <td><span class="badge badge-primary" style="font-family: monospace; font-size: 0.8rem;">${a.booking_code || '-'}</span></td>
          <td>${a.customer_phone}</td>
          <td>${a.product_name || 'Tư vấn chung'}</td>
          <td>${API.formatDate(a.appointment_date)}</td>
          <td>${API.formatTime(a.appointment_time)}</td>
          <td>${a.duration_minutes} phút</td>
          <td>${getStatusBadge(a.status)}</td>
          <td>
            ${a.status !== 'cancelled' && a.status !== 'completed'
              ? `<button class="btn btn-sm btn-danger" onclick="cancelAppointment('${a.id}')">Hủy lịch</button>`
              : '<span class="text-muted">-</span>'}
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger p-3">${err.message || 'Lỗi khi tải lịch hẹn'}</td></tr>`;
  }
}

async function cancelAppointment(id) {
  if (!confirm('Bạn có chắc chắn muốn hủy lịch hẹn tư vấn này?')) return;
  try {
    const res = await API.post(`/api/appointments/cancel/${id}`);
    if (res.success) {
      API.showToast('Lịch hẹn đã được hủy thành công', 'success');
      loadMyAppointments();
      const lookupDiv = document.getElementById('lookup-result');
      if (lookupDiv) lookupDiv.innerHTML = '';
    }
  } catch (err) {
    API.showToast(err.message || 'Không thể hủy lịch', 'error');
  }
}

// ─── Auth Modal Handlers ───
function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const title = document.getElementById('auth-modal-title');

  if (tab === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
    if (formLogin) formLogin.style.display = 'block';
    if (formRegister) formRegister.style.display = 'none';
    if (title) title.textContent = 'Đăng Nhập Khách Hàng';
  } else {
    if (tabRegister) tabRegister.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    if (formRegister) formRegister.style.display = 'block';
    if (formLogin) formLogin.style.display = 'none';
    if (title) title.textContent = 'Đăng Ký Tài Khoản Mới';
  }
}

async function logoutUser() {
  API.removeCustomerToken();
  currentUser = null;
  API.showToast('Đã đăng xuất', 'info');
  await checkUserAuth();
  loadMyAppointments();
}

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', async () => {
  // Set min date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateStr = tomorrow.toISOString().split('T')[0];
  const dateInput = document.getElementById('book-date');
  if (dateInput) {
    dateInput.min = minDateStr;
    dateInput.value = minDateStr;
  }

  loadProductsDropdown();
  loadAvailableSlots(minDateStr);

  await checkUserAuth();
  loadMyAppointments();

  // Booking Form submit
  const formBooking = document.getElementById('form-booking');
  if (formBooking) {
    formBooking.addEventListener('submit', handleBookingSubmit);
  }

  // Date change triggers slot re-check
  if (dateInput) {
    dateInput.addEventListener('change', (e) => loadAvailableSlots(e.target.value));
  }

  // Lookup by Phone + Booking Code form
  const formLookupCode = document.getElementById('form-lookup-code');
  if (formLookupCode) {
    formLookupCode.addEventListener('submit', (e) => {
      e.preventDefault();
      lookupByPhoneAndCode();
    });
  }

  // Lookup by Token button & keydown
  const btnLookupToken = document.getElementById('btn-lookup-token') || document.getElementById('btn-lookup');
  if (btnLookupToken) {
    btnLookupToken.addEventListener('click', () => lookupByToken());
  }
  const tokenInput = document.getElementById('token-input');
  if (tokenInput) {
    tokenInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        lookupByToken();
      }
    });
  }

  // Auth modal buttons
  const tabLogin = document.getElementById('tab-login');
  if (tabLogin) tabLogin.addEventListener('click', () => switchAuthTab('login'));
  const tabRegister = document.getElementById('tab-register');
  if (tabRegister) tabRegister.addEventListener('click', () => switchAuthTab('register'));
  const btnCloseAuth = document.getElementById('btn-close-auth');
  if (btnCloseAuth) btnCloseAuth.addEventListener('click', closeAuthModal);
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', logoutUser);

  // Form Login
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const res = await API.post('/api/auth/login', { email, password });
        if (res.success && res.data) {
          if (res.data.user && res.data.user.role !== 'user') {
            API.showToast('Vui lòng sử dụng tài khoản khách hàng để đăng nhập tại đây!', 'warning');
            return;
          }
          API.setCustomerToken(res.data.token);
          if (res.data.user) {
            API.setCustomerUser(res.data.user);
          }
          API.showToast('Đăng nhập thành công!', 'success');
          closeAuthModal();
          await checkUserAuth();
          loadMyAppointments();
        }
      } catch (err) {
        API.showToast(err.message || 'Đăng nhập thất bại. Kiểm tra email và mật khẩu!', 'error');
      }
    });
  }

  // Form Register
  const formRegister = document.getElementById('form-register');
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const phone = document.getElementById('reg-phone').value.trim();
      const password = document.getElementById('reg-password').value;

      try {
        const res = await API.post('/api/auth/register', { name, email, phone, password });
        if (res.success && res.data) {
          API.setCustomerToken(res.data.token);
          if (res.data.user) {
            API.setCustomerUser(res.data.user);
          }
          API.showToast('Đăng ký tài khoản thành công!', 'success');
          closeAuthModal();
          await checkUserAuth();
          loadMyAppointments();
        }
      } catch (err) {
        API.showToast(err.message || 'Đăng ký thất bại!', 'error');
      }
    });
  }

  // URL query params auto-lookup support
  const urlParams = new URLSearchParams(window.location.search);
  const urlPhone = urlParams.get('phone') || urlParams.get('customerPhone') || urlParams.get('customer_phone');
  const urlCode = urlParams.get('bookingCode') || urlParams.get('booking_code');
  const urlToken = urlParams.get('token');

  if (urlPhone && urlCode) {
    const lookupPhoneInput = document.getElementById('lookup-phone');
    const lookupCodeInput = document.getElementById('lookup-booking-code');
    if (lookupPhoneInput) lookupPhoneInput.value = urlPhone;
    if (lookupCodeInput) lookupCodeInput.value = urlCode;
    lookupByPhoneAndCode(urlPhone, urlCode);
  } else if (urlToken) {
    if (tokenInput) tokenInput.value = urlToken;
    lookupByToken(urlToken);
  }
});
