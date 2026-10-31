'use strict';

const jsonStore = require('../config/jsonStore');

async function get(key) {
  const settings = jsonStore.getCollection('system_settings');
  const found = settings.find(s => s.key === key);
  return found ? found.value : null;
}

async function getPublic() {
  const settings = jsonStore.getCollection('system_settings');
  const result = {};
  for (const s of settings) {
    if (s.is_public) {
      result[s.key] = s.value;
    }
  }
  return result;
}

async function getAll() {
  const settings = jsonStore.getCollection('system_settings');
  const sorted = [...settings].sort((a, b) => a.key.localeCompare(b.key));
  return sorted;
}

async function set(key, value) {
  const settings = jsonStore.getCollection('system_settings');
  const found = settings.find(s => s.key === key);
  const now = new Date().toISOString();
  if (found) {
    found.value = String(value);
    found.updated_at = now;
  } else {
    settings.push({
      key,
      value: String(value),
      is_public: false,
      updated_at: now,
    });
  }
  jsonStore.saveCollection('system_settings', settings);
}

async function getBusinessSetting(key) {
  const settings = jsonStore.getCollection('business_settings');
  const found = settings.find(s => s.key === key);
  if (!found) return null;
  return typeof found.value === 'string' ? JSON.parse(found.value) : found.value;
}

async function setBusinessSetting(key, value) {
  const settings = jsonStore.getCollection('business_settings');
  const found = settings.find(s => s.key === key);
  const now = new Date().toISOString();
  const parsedValue = typeof value === 'string' ? (() => {
    try { return JSON.parse(value); } catch { return value; }
  })() : value;

  if (found) {
    found.value = parsedValue;
    found.updated_at = now;
  } else {
    settings.push({
      key,
      value: parsedValue,
      updated_at: now,
    });
  }
  jsonStore.saveCollection('business_settings', settings);
}

async function getAllBusiness() {
  const settings = jsonStore.getCollection('business_settings');
  const sorted = [...settings].sort((a, b) => a.key.localeCompare(b.key));
  return sorted;
}

module.exports = {
  get,
  getPublic,
  getAll,
  set,
  getBusinessSetting,
  setBusinessSetting,
  getAllBusiness,
};
