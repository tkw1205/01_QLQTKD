'use strict';

const accountStatus = document.getElementById('account-status');
const accountForms = document.getElementById('account-forms');
const accountProfile = document.getElementById('account-profile');
const loginForm = document.getElementById('form-login');
const registerForm = document.getElementById('form-register');
const authTabs = [
  document.getElementById('tab-login'),
  document.getElementById('tab-register'),
];
let isSubmitting = false;

function showAccountStatus(message, type = 'info') {
  accountStatus.textContent = message;
  accountStatus.className = `account-status alert alert-${type}`;
  accountStatus.hidden = !message;
}

function clearFieldError(input) {
  const error = document.getElementById(`${input.id}-error`);
  input.removeAttribute('aria-invalid');
  if (error) error.textContent = '';
}

function setFieldError(input, message) {
  const error = document.getElementById(`${input.id}-error`);
  input.setAttribute('aria-invalid', 'true');
  if (error) error.textContent = message;
}

function clearFormErrors(form) {
  form.querySelectorAll('input').forEach(clearFieldError);
  showAccountStatus('');
}

function validateForm(form, fields) {
  let firstInvalidInput = null;
  for (const [id, rules] of fields) {
    const input = document.getElementById(id);
    clearFieldError(input);
    let message = '';

    if (rules.required && !input.value.trim()) {
      message = 'Vui lòng nhập thông tin này.';
    } else if (input.value && input.type === 'email' && input.validity.typeMismatch) {
      message = 'Vui lòng nhập địa chỉ email hợp lệ.';
    } else if (rules.minLength && input.value.length < rules.minLength) {
      message = `Mật khẩu cần có ít nhất ${rules.minLength} ký tự.`;
    }

    if (message) {
      setFieldError(input, message);
      if (!firstInvalidInput) firstInvalidInput = input;
    }
  }

  if (firstInvalidInput) {
    firstInvalidInput.focus();
    return false;
  }
  return true;
}

function setSubmitting(form, isBusy, idleLabel, busyLabel) {
  const button = form.querySelector('.account-submit');
  if (!button) return;
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : idleLabel;
  button.setAttribute('aria-busy', String(isBusy));
}

function showAuthForm(tab = 'login') {
  accountForms.hidden = false;
  accountProfile.hidden = true;
  loginForm.hidden = tab !== 'login';
  registerForm.hidden = tab !== 'register';
  authTabs.forEach((button, index) => {
    const selected = (index === 0 && tab === 'login') || (index === 1 && tab === 'register');
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  clearFormErrors(loginForm);
  clearFormErrors(registerForm);
}

function showCustomerProfile(user) {
  accountForms.hidden = true;
  accountProfile.hidden = false;
  document.getElementById('account-name').textContent = user.name || '';
  document.getElementById('account-email').textContent = user.email || '';
}

async function loadCustomerProfile() {
  const token = API.getCustomerToken();
  if (!token) {
    showAuthForm();
    return;
  }

  try {
    const res = await API.get('/api/auth/me');
    const user = res.data && res.data.user;
    if (user && user.role === 'user') {
      API.setCustomerUser(user);
      showCustomerProfile(user);
      return;
    }

    API.removeCustomerToken();
    showAuthForm();
    showAccountStatus('Vui lòng đăng nhập bằng tài khoản khách hàng.', 'warning');
  } catch (error) {
    if (error.status === 401) {
      API.removeCustomerToken();
      showAuthForm();
      return;
    }
    showAuthForm();
    showAccountStatus(error.message || 'Không thể kiểm tra tài khoản. Vui lòng thử lại.', 'danger');
  }
}

document.getElementById('tab-login').addEventListener('click', () => {
  if (!isSubmitting) showAuthForm('login');
});
document.getElementById('tab-register').addEventListener('click', () => {
  if (!isSubmitting) showAuthForm('register');
});
authTabs.forEach((button, index) => {
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : authTabs.length - 1)) % authTabs.length;
    if (isSubmitting) return;
    showAuthForm(nextIndex === 0 ? 'login' : 'register');
    authTabs[nextIndex].focus();
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting || !validateForm(loginForm, [
    ['login-email', { required: true }],
    ['login-password', { required: true }],
  ])) return;

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  isSubmitting = true;
  setSubmitting(loginForm, true, 'Đăng nhập', 'Đang đăng nhập...');
  showAccountStatus('Đang xác thực tài khoản...', 'info');
  try {
    const res = await API.post('/api/auth/login', {
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });
    const { token, user } = res.data || {};
    if (!token || !user || user.role !== 'user') {
      showAccountStatus('');
      setFieldError(emailInput, 'Vui lòng sử dụng tài khoản khách hàng.');
      return;
    }

    API.setCustomerToken(token);
    API.setCustomerUser(user);
    showCustomerProfile(user);
    showAccountStatus('Đăng nhập thành công.', 'success');
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      showAccountStatus('');
      if (error.status === 403) {
        setFieldError(emailInput, 'Tài khoản này hiện không hoạt động.');
      } else {
        setFieldError(passwordInput, 'Email hoặc mật khẩu không chính xác.');
      }
    } else {
      showAccountStatus(error.message || 'Đăng nhập thất bại. Vui lòng thử lại.', 'danger');
    }
  } finally {
    isSubmitting = false;
    setSubmitting(loginForm, false, 'Đăng nhập', 'Đang đăng nhập...');
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting || !validateForm(registerForm, [
    ['reg-name', { required: true }],
    ['reg-email', { required: true }],
    ['reg-phone', { required: false }],
    ['reg-password', { required: true, minLength: 8 }],
  ])) return;

  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const phoneInput = document.getElementById('reg-phone');
  const passwordInput = document.getElementById('reg-password');
  isSubmitting = true;
  setSubmitting(registerForm, true, 'Tạo tài khoản', 'Đang tạo tài khoản...');
  showAccountStatus('Đang tạo tài khoản...', 'info');
  try {
    const res = await API.post('/api/auth/register', {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      password: passwordInput.value,
    });
    const { token, user } = res.data || {};
    if (!token || !user || user.role !== 'user') {
      showAccountStatus('');
      showAccountStatus('Không thể tạo tài khoản khách hàng. Vui lòng thử lại.', 'danger');
      return;
    }

    API.setCustomerToken(token);
    API.setCustomerUser(user);
    showCustomerProfile(user);
    showAccountStatus('Đăng ký thành công.', 'success');
  } catch (error) {
    if (error.status === 409) {
      showAccountStatus('');
      setFieldError(emailInput, 'Email này đã được sử dụng.');
    } else if (error.status === 400 && /password/i.test(error.message || '')) {
      showAccountStatus('');
      setFieldError(passwordInput, 'Mật khẩu cần có ít nhất 8 ký tự.');
    } else {
      showAccountStatus(error.message || 'Đăng ký thất bại. Vui lòng thử lại.', 'danger');
    }
  } finally {
    isSubmitting = false;
    setSubmitting(registerForm, false, 'Tạo tài khoản', 'Đang tạo tài khoản...');
  }
});

document.querySelectorAll('.account-field input').forEach((input) => {
  input.addEventListener('input', () => clearFieldError(input));
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    await API.post('/api/auth/logout', {});
  } catch (error) {
    showAccountStatus(error.message || 'Không thể kết thúc phiên trên máy chủ.', 'danger');
  } finally {
    API.removeCustomerToken();
    API.setCustomerUser(null);
    showAuthForm();
  }
});

const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');
navToggle.addEventListener('click', () => {
  const isOpen = navMenu.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});
navMenu.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

loadCustomerProfile();
