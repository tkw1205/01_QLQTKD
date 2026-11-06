'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const staffPage = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'admin', 'staff.html'),
  'utf8'
).replace(/\r\n/g, '\n');
const formStart = staffPage.indexOf("formCreateAppt.addEventListener('submit', async (e) => {");
const bodyStart = staffPage.indexOf('{', formStart) + 1;
const bodyEnd = staffPage.indexOf(
  '\n      });\n\n      // ─── TAB 2:',
  bodyStart
);
assert.ok(formStart >= 0 && bodyStart > 0 && bodyEnd > bodyStart, 'Admin appointment submit handler must exist');
const submitHandlerBody = staffPage.slice(bodyStart, bodyEnd);

const dependencies = [
  'inputCustName',
  'inputCustPhone',
  'inputCustEmail',
  'inputApptDate',
  'inputApptTime',
  'selectApptStaff',
  'inputApptNotes',
  'servicesListContainer',
  'availableServices',
  'getServiceDuration',
  'getServicePrice',
  'getScheduleScrollState',
  'btnSubmitCreateAppt',
  'Admin',
  'escapeHtml',
  'closeCreateApptModal',
  'scheduleDateInput',
  'updateAppointmentInPlace',
  'strictRestoreScroll',
];

function createFormHarness(overrides = {}) {
  const calls = [];
  const toasts = [];
  const focusCalls = [];
  const checkedBoxes = overrides.checkedBoxes || [
    { value: 'service-one' },
    { value: 'service-two' },
  ];
  const sizeSelects = overrides.sizeSelects || [
    { dataset: { serviceSizeFor: 'service-one' }, value: 'M' },
    { dataset: { serviceSizeFor: 'service-two' }, value: 'S' },
  ];
  const defaultValue = (value) => ({ value, focus() { focusCalls.push(this); } });
  const inputs = {
    inputCustName: defaultValue('Khách kiểm thử'),
    inputCustPhone: defaultValue('0901234567'),
    inputCustEmail: defaultValue(''),
    inputApptDate: defaultValue('2030-01-15'),
    inputApptTime: defaultValue('10:00'),
    selectApptStaff: defaultValue(''),
    inputApptNotes: defaultValue('Ghi chú kiểm thử'),
    btnSubmitCreateAppt: { disabled: false, textContent: '➕ Xác nhận Đặt lịch' },
    scheduleDateInput: { value: '2030-01-15' },
  };
  const services = [
    { id: 'service-one', duration_minutes: 45, prices_by_size: { M: { price: 150000, duration: 45 } } },
    { id: 'service-two', duration_minutes: 20, prices_by_size: { S: { price: 80000, duration: 20 } } },
  ];
  let modalClosed = false;
  const updatedAppointments = [];
  const restoredScrollStates = [];
  const harness = {
    ...inputs,
    calls,
    toasts,
    focusCalls,
    updatedAppointments,
    restoredScrollStates,
    get modalClosed() { return modalClosed; },
    set modalClosed(value) { modalClosed = value; },
    handler: null,
  };

  const values = {
    ...inputs,
    servicesListContainer: {
      querySelectorAll(selector) {
        return selector === 'input[type="checkbox"]:checked' ? checkedBoxes : sizeSelects;
      },
    },
    availableServices: services,
    getServiceDuration: service => service.prices_by_size.M?.duration || service.duration_minutes,
    getServicePrice: service => service.prices_by_size.M?.price || 0,
    getScheduleScrollState: () => ({ top: 100 }),
    Admin: {
      async api(url, options) {
        calls.push({ url, options });
        if (overrides.api) return overrides.api(url, options);
        return {
          success: true,
          data: { id: 'appointment-1', appointment_date: '2030-01-15' },
        };
      },
      toast(message, type) {
        toasts.push({ message, type });
      },
    },
    escapeHtml: value => String(value),
    closeCreateApptModal() {
      harness.modalClosed = true;
    },
    updateAppointmentInPlace(appointment) {
      updatedAppointments.push(appointment);
    },
    strictRestoreScroll(state) {
      restoredScrollStates.push(state);
    },
  };

  harness.handler = new Function(
    ...dependencies,
    `return async (e) => {${submitHandlerBody}\n};`
  )(...dependencies.map(name => values[name]));

  return harness;
}

async function submit(harness) {
  let prevented = false;
  await harness.handler({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true, 'Form submit must prevent browser navigation');
}

test('APPT-FORM-001/005/006/009/012/014: form declares required fields and rejects missing or invalid values before API call', async t => {
  const requiredIds = [
    'create-appt-cust-name',
    'create-appt-cust-phone',
    'create-appt-date',
    'create-appt-time',
  ];
  for (const id of requiredIds) {
    assert.match(
      staffPage,
      new RegExp(`<input[^>]*id="${id}"[^>]*required`),
      `${id} must be required in the admin form`
    );
  }
  assert.match(staffPage, /type="email" id="create-appt-cust-email"/);
  assert.doesNotMatch(
    staffPage.match(/<input type="email" id="create-appt-cust-email"[^>]*>/)?.[0] || '',
    /\brequired\b/,
    'Customer email must remain optional'
  );

  const cases = [
    {
      name: 'blank customer name',
      field: 'inputCustName',
      value: '   ',
      focusIndex: 0,
      message: /họ và tên/i,
    },
    {
      name: 'blank phone',
      field: 'inputCustPhone',
      value: '',
      focusIndex: 1,
      message: /số điện thoại/i,
    },
    {
      name: 'invalid phone',
      field: 'inputCustPhone',
      value: '12345',
      focusIndex: 1,
      message: /10 số di động/i,
    },
    {
      name: 'invalid optional email',
      field: 'inputCustEmail',
      value: 'khach@',
      focusIndex: null,
      message: /email không đúng định dạng/i,
    },
    {
      name: 'no selected service',
      checkedBoxes: [],
      focusIndex: null,
      message: /ít nhất 1 dịch vụ/i,
    },
    {
      name: 'missing date',
      field: 'inputApptDate',
      value: '',
      focusIndex: null,
      message: /ngày và giờ hẹn/i,
    },
    {
      name: 'missing time',
      field: 'inputApptTime',
      value: '',
      focusIndex: null,
      message: /ngày và giờ hẹn/i,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const harness = createFormHarness({
        checkedBoxes: scenario.checkedBoxes,
      });
      if (scenario.field) harness[scenario.field].value = scenario.value;

      await submit(harness);

      assert.equal(harness.calls.length, 0, 'Invalid form must not call the create API');
      assert.match(harness.toasts.at(-1)?.message || '', scenario.message);
      if (scenario.focusIndex !== null) {
        assert.equal(harness.focusCalls.length, 1, 'Invalid required input should receive focus');
      }
      assert.equal(harness.btnSubmitCreateAppt.disabled, false);
    });
  }
});

test('APPT-FORM-002/008/009/010/011/018/021: valid form submits normalized customer and multi-service data', async () => {
  const harness = createFormHarness();
  harness.inputCustName.value = '  Nguyễn Văn A  ';
  harness.inputCustPhone.value = '+84 901 234 567';
  harness.inputCustEmail.value = ' khach@example.com ';
  harness.selectApptStaff.value = '';
  harness.inputApptNotes.value = '  Da đầu nhạy cảm  ';

  await submit(harness);

  assert.equal(harness.calls.length, 1);
  const [request] = harness.calls;
  assert.equal(request.url, '/api/appointments');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(request.options.body, {
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    customerEmail: 'khach@example.com',
    productIds: ['service-one', 'service-two'],
    productId: 'service-one',
    productSizes: { 'service-one': 'M', 'service-two': 'S' },
    appointmentDate: '2030-01-15',
    appointmentTime: '10:00',
    durationMinutes: 65,
    staffId: null,
    notes: 'Da đầu nhạy cảm',
    confirmedBySystem: true,
  });
  assert.equal(harness.modalClosed, true);
  assert.equal(harness.inputCustName.value, '');
  assert.equal(harness.inputCustPhone.value, '');
  assert.equal(harness.inputCustEmail.value, '');
  assert.equal(harness.inputApptNotes.value, '');
  assert.equal(harness.updatedAppointments.length, 1);
  assert.equal(harness.restoredScrollStates.length, 1);
  assert.equal(harness.toasts.at(-1).type, 'success');
  assert.equal(harness.btnSubmitCreateAppt.disabled, false);
});

test('APPT-FORM-009/022/023: optional blank email is null, submit is locked in flight, and errors preserve form values', async t => {
  await t.test('blank email is normalized to null', async () => {
    const harness = createFormHarness();
    harness.inputCustEmail.value = '   ';

    await submit(harness);

    assert.equal(harness.calls[0].options.body.customerEmail, null);
  });

  await t.test('duplicate submit while request is pending does not create another appointment', async () => {
    let resolveRequest;
    const harness = createFormHarness({
      api: () => new Promise(resolve => {
        resolveRequest = resolve;
      }),
    });
    const firstSubmit = harness.handler({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(harness.btnSubmitCreateAppt.disabled, true);
    assert.match(harness.btnSubmitCreateAppt.textContent, /Đang tạo lịch/);
    await submit(harness);
    assert.equal(harness.calls.length, 1);

    resolveRequest({
      success: true,
      data: { id: 'appointment-1', appointment_date: '2030-01-15' },
    });
    await firstSubmit;
    assert.equal(harness.btnSubmitCreateAppt.disabled, false);
  });

  await t.test('API failure shows error and keeps entered values for correction', async () => {
    const harness = createFormHarness({
      api: async () => ({ success: false, error: 'Slot conflict' }),
    });

    await submit(harness);

    assert.equal(harness.modalClosed, false);
    assert.equal(harness.inputCustName.value, 'Khách kiểm thử');
    assert.equal(harness.inputCustPhone.value, '0901234567');
    assert.equal(harness.inputApptDate.value, '2030-01-15');
    assert.equal(harness.inputApptNotes.value, 'Ghi chú kiểm thử');
    assert.deepEqual(harness.toasts.at(-1), { message: 'Slot conflict', type: 'error' });
    assert.equal(harness.btnSubmitCreateAppt.disabled, false);
    assert.equal(harness.btnSubmitCreateAppt.textContent, '➕ Xác nhận Đặt lịch');
  });
});
