'use strict';
const bcrypt = require('bcryptjs');
const { signToken } = require('../config/jwt');
const userRepo = require('../repositories/userRepository');

const SALT_ROUNDS = 12;

async function login(email, password) {
  if (!email || !password) {
    throw Object.assign(new Error('Email and password are required'), { status: 400 });
  }

  const user = await userRepo.findByEmail(email.toLowerCase().trim());
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }
  if (!user.is_active) {
    throw Object.assign(new Error('Account is deactivated'), { status: 403 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const token = signToken({ userId: user.id, role: user.role });
  const { password_hash, ...userWithoutPassword } = user;
  return { token, user: userWithoutPassword };
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function createUser({ email, password, name, role = 'staff', phone = null, isAvailable = true }) {
  if (!email || !password || !name) {
    throw Object.assign(new Error('email, password and name are required'), { status: 400 });
  }
  if (password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  }

  const existing = await userRepo.findByEmail(email.toLowerCase().trim());
  if (existing) {
    throw Object.assign(new Error('Email already in use'), { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  return userRepo.create({
    email: email.toLowerCase().trim(),
    passwordHash,
    name: name.trim(),
    role,
    phone: phone ? phone.trim() : null,
    isAvailable,
  });
}

async function register({ email, password, name, phone }) {
  const user = await createUser({
    email,
    password,
    name,
    phone,
    role: 'user',
  });
  const token = signToken({ userId: user.id, role: user.role });
  const { password_hash, ...userWithoutPassword } = user;
  return { token, user: userWithoutPassword };
}

async function updateProfile(userId, { name, phone }) {
  const updates = {};
  if (name && name.trim()) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone ? phone.trim() : null;
  const updated = await userRepo.update(userId, updates);
  if (!updated) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
  const { password_hash, ...userWithoutPassword } = updated;
  return userWithoutPassword;
}

module.exports = { login, hashPassword, createUser, register, updateProfile };
