'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const APPROVED_CATEGORIES = require('../../database/data/categories.json');
const APPROVED_PRODUCTS = require('../../database/data/products.json');

const DATA_DIR = path.resolve(__dirname, '../../database/data');

// Default initial dataset
const INITIAL_CATEGORIES = [
  {
    id: '11111111-1111-1111-1111-111111111001',
    name: 'Điện thoại',
    slug: 'dien-thoai',
    description: 'Điện thoại thông minh các loại',
    is_active: true,
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '11111111-1111-1111-1111-111111111002',
    name: 'Laptop',
    slug: 'laptop',
    description: 'Máy tính xách tay văn phòng và gaming',
    is_active: true,
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '11111111-1111-1111-1111-111111111003',
    name: 'Phụ kiện',
    slug: 'phu-kien',
    description: 'Phụ kiện điện tử, tai nghe, chuột, bàn phím',
    is_active: true,
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
];

const INITIAL_PRODUCTS = [
  {
    id: '22222222-2222-2222-2222-222222222001',
    category_id: '11111111-1111-1111-1111-111111111001',
    name: 'iPhone 15 Pro Max',
    slug: 'iphone-15-pro-max',
    description: 'iPhone 15 Pro Max với chip A17 Pro, camera 48MP ProRAW, màn hình 6.7 inch Super Retina XDR. Thiết kế titan cao cấp, pin 29 giờ.',
    price: 34990000,
    image_url: null,
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222002',
    category_id: '11111111-1111-1111-1111-111111111001',
    name: 'Samsung Galaxy S24 Ultra',
    slug: 'samsung-galaxy-s24-ultra',
    description: 'Samsung Galaxy S24 Ultra trang bị bút S Pen, màn hình Dynamic AMOLED 6.8 inch, camera zoom 100x, chip Snapdragon 8 Gen 3.',
    price: 31990000,
    image_url: null,
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222003',
    category_id: '11111111-1111-1111-1111-111111111002',
    name: 'MacBook Pro 14 M3 Pro',
    slug: 'macbook-pro-14-m3-pro',
    description: 'MacBook Pro 14 inch chip M3 Pro, RAM 18GB, SSD 512GB, màn hình Liquid Retina XDR 3024×1964, pin 18 giờ.',
    price: 54990000,
    image_url: null,
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222004',
    category_id: '11111111-1111-1111-1111-111111111002',
    name: 'Dell XPS 15 9530',
    slug: 'dell-xps-15-9530',
    description: 'Dell XPS 15 với Intel Core i7-13700H, RAM 16GB DDR5, SSD 512GB, màn hình OLED 3.5K cảm ứng, card NVIDIA RTX 4060.',
    price: 42990000,
    image_url: null,
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222005',
    category_id: '11111111-1111-1111-1111-111111111003',
    name: 'AirPods Pro 2',
    slug: 'airpods-pro-2',
    description: 'AirPods Pro thế hệ 2 với chip H2, chống ồn ANC thế hệ mới, âm thanh Adaptive Audio, hộp sạc USB-C, pin 6 giờ.',
    price: 6490000,
    image_url: null,
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222006',
    category_id: '11111111-1111-1111-1111-111111111003',
    name: 'Logitech MX Master 3S',
    slug: 'logitech-mx-master-3s',
    description: 'Chuột không dây cao cấp Logitech MX Master 3S, độ chính xác 8000 DPI, kết nối Bluetooth đa thiết bị, pin 70 ngày.',
    price: 2590000,
    image_url: null,
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
];

const INITIAL_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@example.com',
    password_hash: bcrypt.hashSync('Admin@123456', 10),
    name: 'Administrator',
    role: 'admin',
    phone: '0900000001',
    is_active: true,
    is_available: true,
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333001',
    email: 'staff@example.com',
    password_hash: bcrypt.hashSync('Staff@123456', 10),
    name: 'Nhân Viên Tư Vấn',
    role: 'staff',
    phone: '0900000002',
    is_active: true,
    is_available: true,
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '44444444-4444-4444-4444-444444444001',
    email: 'receptionist@example.com',
    password_hash: bcrypt.hashSync('Receptionist@123456', 10),
    name: 'Nhân Viên Lễ Tân',
    role: 'receptionist',
    phone: '0900000003',
    is_active: true,
    is_available: true,
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
  {
    id: '55555555-5555-5555-5555-555555555001',
    email: 'user@example.com',
    password_hash: bcrypt.hashSync('User@123456', 10),
    name: 'Nguyễn Văn Khách',
    role: 'user',
    phone: '0988776655',
    is_active: true,
    is_available: false,
    created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  },
];

const INITIAL_SYSTEM_SETTINGS = [
  { key: 'site_name', value: 'Chatbox Demo Store', is_public: true, updated_at: new Date().toISOString() },
  { key: 'site_tagline', value: 'Tư vấn sản phẩm trực tuyến', is_public: true, updated_at: new Date().toISOString() },
  { key: 'ai_welcome_message', value: 'Xin chào quý khách! Em là AI tư vấn của salon. Em có thể hỗ trợ mình tìm hiểu dịch vụ, tham khảo giá và thời gian thực hiện hoặc hướng dẫn đặt lịch trực tuyến. Mình cần tư vấn nội dung nào ạ?', is_public: true, updated_at: new Date().toISOString() },
  { key: 'ai_system_prompt', value: 'Bạn là AI tư vấn khách hàng salon tóc; luôn lịch sự, thân thiện, chuyên nghiệp, ngắn gọn và bằng tiếng Việt. Khi bắt đầu hội thoại, chào tự nhiên và gợi mở nhu cầu; nếu đã có lời chào của trợ lý trong lịch sử thì không lặp lại. Khi khách chào kèm câu hỏi, chào ngắn rồi ưu tiên trả lời. Nêu rõ bạn là AI, không phải nhân viên thật; không tự hỏi tên, số điện thoại hoặc email khi chưa cần. Chỉ tư vấn dịch vụ, giá và thời lượng trong danh sách dịch vụ đang hoạt động được hệ thống đưa vào prompt; không bịa dịch vụ, mức giá theo size, khuyến mãi, phụ thu hay thời lượng. Quy ước tóc: S từ cằm trở lên, M từ cằm đến ngang vai, L từ ngang ngực trở xuống; chỉ hỏi size nếu giá dịch vụ thực sự phụ thuộc size, không tự đoán và nhờ nhân viên xác nhận khi ở ranh giới hoặc vùng chưa được quy ước. Không lấy giá ví dụ làm giá thật. Thời lượng là dự kiến; chỉ cộng thời gian nhiều dịch vụ khi có đủ căn cứ. Không cam kết kết quả tóc giống ảnh, không chẩn đoán bệnh. Không hỏi lại thông tin đã có. Salon hiện chưa có địa điểm tiếp khách trực tiếp; không cung cấp địa chỉ cụ thể. Không hứa gửi email xác nhận. Khi khách hỏi giờ trống, luôn gọi công cụ kiểm tra ngay và chỉ đưa ra các giờ hệ thống trả về; nếu khách chọn giờ cụ thể thì chỉ giữ chỗ sau khi xác minh giờ đó còn trống. Chỉ nói giữ chỗ/đặt lịch thành công nếu công cụ trả về thành công; chỉ cung cấp mã thật từ hệ thống. Khi lỗi/timeout lúc đặt lịch, không khẳng định thành công hoặc gửi lại yêu cầu tạo lịch một cách mù quáng; hướng dẫn khách tra cứu nếu có mã hoặc chuyển nhân viên xác minh. Khi muốn gặp nhân viên, hướng dẫn bấm nút Chat với nhân viên; không nói đã chuyển nếu chưa có sự kiện xác nhận. Không hỏi lại thông tin đã có; khi thiếu dữ liệu, hướng dẫn khách liên hệ nhân viên.', is_public: false, updated_at: new Date().toISOString() },
  { key: 'max_ai_turns', value: '10', is_public: false, updated_at: new Date().toISOString() },
  { key: 'appointment_duration', value: '30', is_public: true, updated_at: new Date().toISOString() },
  { key: 'allow_guest_chat', value: 'true', is_public: true, updated_at: new Date().toISOString() },
];

const INITIAL_BUSINESS_SETTINGS = [
  {
    key: 'working_hours',
    value: {
      monday: { open: '08:00', close: '17:30', enabled: true },
      tuesday: { open: '08:00', close: '17:30', enabled: true },
      wednesday: { open: '08:00', close: '17:30', enabled: true },
      thursday: { open: '08:00', close: '17:30', enabled: true },
      friday: { open: '08:00', close: '17:30', enabled: true },
      saturday: { open: '08:00', close: '12:00', enabled: false },
      sunday: { open: '08:00', close: '12:00', enabled: false },
    },
    updated_at: new Date().toISOString(),
  },
  {
    key: 'contact_info',
    value: {
      phone: '0901234567',
      email: 'contact@chatbox.vn',
      address: '123 Đường ABC, Quận 1, TP.HCM',
      facebook: 'https://facebook.com/chatbox',
      zalo: '0901234567',
    },
    updated_at: new Date().toISOString(),
  },
];

const DEFAULT_MAP = {
  categories: APPROVED_CATEGORIES,
  products: APPROVED_PRODUCTS,
  users: INITIAL_USERS,
  conversations: [],
  messages: [],
  appointments: [],
  notifications: [],
  system_settings: INITIAL_SYSTEM_SETTINGS,
  business_settings: INITIAL_BUSINESS_SETTINGS,
  schema_migrations: [],
};

// In-memory cache for fast read access
const cache = {};

// Per-collection write mutex locks
const collectionLocks = new Map();

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy wait fallback
    }
  }
}

function acquireSyncLock(collection, maxWaitMs = 5000) {
  const start = Date.now();
  while (collectionLocks.get(collection)) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error(`Write mutex lock timeout for collection "${collection}"`);
    }
    sleepSync(10);
  }
  collectionLocks.set(collection, true);
}

function releaseSyncLock(collection) {
  collectionLocks.set(collection, false);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function cleanupOrphanedTmpFiles() {
  try {
    ensureDataDir();
    const files = fs.readdirSync(DATA_DIR);
    for (const file of files) {
      if (file.includes('.tmp.') || file.endsWith('.tmp')) {
        const fullPath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(fullPath);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

function getFilePath(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

function loadCollection(collection) {
  ensureDataDir();
  const filePath = getFilePath(collection);
  if (!fs.existsSync(filePath)) {
    const defaults = DEFAULT_MAP[collection] !== undefined ? DEFAULT_MAP[collection] : [];
    saveCollection(collection, defaults);
    cache[collection] = JSON.parse(JSON.stringify(defaults));
    return cache[collection];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) {
      const defaults = DEFAULT_MAP[collection] !== undefined ? DEFAULT_MAP[collection] : [];
      saveCollection(collection, defaults);
      cache[collection] = JSON.parse(JSON.stringify(defaults));
      return cache[collection];
    }
    const data = JSON.parse(content);
    cache[collection] = data;
    return cache[collection];
  } catch (err) {
    console.error(`[MockDB] Error reading collection "${collection}":`, err.message);
    const defaults = DEFAULT_MAP[collection] !== undefined ? DEFAULT_MAP[collection] : [];
    cache[collection] = JSON.parse(JSON.stringify(defaults));
    return cache[collection];
  }
}

function saveCollection(collection, data) {
  ensureDataDir();
  acquireSyncLock(collection);

  const filePath = getFilePath(collection);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const tempPath = path.join(DATA_DIR, `${collection}.tmp.${Date.now()}.${randomSuffix}`);
  const serialized = JSON.stringify(data, null, 2);
  const previousCache = cache[collection];

  try {
    fs.writeFileSync(tempPath, serialized, 'utf8');

    // Windows rename retry loop with backoff for transient locks (EPERM / EBUSY)
    const MAX_RETRIES = 5;
    let attempts = 0;
    while (true) {
      try {
        fs.renameSync(tempPath, filePath);
        break;
      } catch (err) {
        attempts++;
        if (attempts > MAX_RETRIES || (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES')) {
          throw err;
        }
        const backoffMs = Math.floor(50 + Math.random() * 50); // 50-100ms
        sleepSync(backoffMs);
      }
    }

    // Atomic update: only update in-memory cache once disk persistence succeeds
    cache[collection] = data;
  } catch (err) {
    // Clean up temporary file on error
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (_) {}
    // Rollback in-memory cache
    cache[collection] = previousCache;
    throw err;
  } finally {
    releaseSyncLock(collection);
  }
}

function getCollection(collection) {
  if (!cache[collection]) {
    loadCollection(collection);
  }
  return cache[collection];
}

function initAll() {
  ensureDataDir();
  cleanupOrphanedTmpFiles();
  for (const collection of Object.keys(DEFAULT_MAP)) {
    loadCollection(collection);
  }
}

// Transaction simulation
let transactionSnapshot = null;

function beginTransaction() {
  transactionSnapshot = JSON.parse(JSON.stringify(cache));
}

function commitTransaction() {
  transactionSnapshot = null;
}

function rollbackTransaction() {
  if (transactionSnapshot) {
    for (const [col, data] of Object.entries(transactionSnapshot)) {
      saveCollection(col, data);
    }
    transactionSnapshot = null;
  }
}

// Clean up any stale orphaned .tmp.* files on startup
cleanupOrphanedTmpFiles();

module.exports = {
  DATA_DIR,
  initAll,
  getCollection,
  saveCollection,
  loadCollection,
  cleanupOrphanedTmpFiles,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
};
