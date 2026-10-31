'use strict';

const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');

async function findByEmail(email) {
  if (!email) return null;
  const users = jsonStore.getCollection('users');
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findById(id) {
  if (!id) return null;
  const users = jsonStore.getCollection('users');
  return users.find(u => u.id === id) || null;
}

async function findAll({ page = 1, limit = 20 } = {}) {
  const users = jsonStore.getCollection('users');
  // Order by created_at DESC
  const sorted = [...users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const offset = (page - 1) * limit;
  const rows = sorted.slice(offset, offset + limit).map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone || null,
    role: u.role,
    is_active: u.is_active,
    is_available: u.is_available,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));
  return { rows, total: sorted.length };
}

async function findAvailableStaff() {
  const users = jsonStore.getCollection('users');
  const available = users.filter(
    u => u.is_active && u.is_available && (u.role === 'admin' || u.role === 'staff')
  );
  if (!available.length) return null;
  const randomIndex = Math.floor(Math.random() * available.length);
  const u = available[randomIndex];
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

async function create({ email, passwordHash, name, role = 'staff', phone = null, isAvailable = true }) {
  const users = jsonStore.getCollection('users');
  const now = new Date().toISOString();
  const newUser = {
    id: uuidv4(),
    email,
    password_hash: passwordHash,
    name,
    role,
    phone: phone || null,
    is_active: true,
    is_available: isAvailable !== undefined ? Boolean(isAvailable) : true,
    created_at: now,
    updated_at: now,
  };
  users.push(newUser);
  jsonStore.saveCollection('users', users);
  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    phone: newUser.phone,
    role: newUser.role,
    is_active: newUser.is_active,
    is_available: newUser.is_available,
    created_at: newUser.created_at,
  };
}

async function update(id, fields) {
  const allowed = ['name', 'email', 'password_hash', 'role', 'is_active', 'is_available', 'phone'];
  const users = jsonStore.getCollection('users');
  const user = users.find(u => u.id === id);
  if (!user) return null;

  let hasUpdate = false;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      user[k] = v;
      hasUpdate = true;
    }
  }
  if (!hasUpdate) throw new Error('No valid fields to update');
  user.updated_at = new Date().toISOString();
  jsonStore.saveCollection('users', users);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone || null,
    role: user.role,
    is_active: user.is_active,
    is_available: user.is_available,
    updated_at: user.updated_at,
  };
}

async function setAvailability(id, isAvailable) {
  const users = jsonStore.getCollection('users');
  const user = users.find(u => u.id === id);
  if (!user) return null;
  user.is_available = Boolean(isAvailable);
  user.updated_at = new Date().toISOString();
  jsonStore.saveCollection('users', users);
  return {
    id: user.id,
    name: user.name,
    is_available: user.is_available,
  };
}

async function countAdmins() {
  const users = jsonStore.getCollection('users');
  return users.filter(u => u.role === 'admin' && u.is_active).length;
}

module.exports = {
  findByEmail,
  findById,
  findAll,
  findAvailableStaff,
  create,
  update,
  setAvailability,
  countAdmins,
};
