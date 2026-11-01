'use strict';
/**
 * Seed sample data for development/demo purposes.
 * Run: npm run seed
 *
 * Safe to run multiple times (skips already existing records).
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jsonStore = require('../src/config/jsonStore');
const { runMigrations } = require('./migrate');

// ─── Sample categories ────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: '11111111-1111-1111-1111-111111111001',
    name: 'Cắt & tạo kiểu',
    slug: 'cat-tao-kieu',
    description: 'Thiết kế phom dáng tóc layer, bob, pixie chuẩn Hàn Quốc tôn đường nét khuôn mặt.',
  },
  {
    id: '11111111-1111-1111-1111-111111111002',
    name: 'Gội & chăm sóc',
    slug: 'goi-cham-soc',
    description: 'Gội đầu thảo dược dưỡng sinh, massage bấm huyệt giải tỏa căng thẳng và thanh lọc nang tóc nano.',
  },
  {
    id: '11111111-1111-1111-1111-111111111003',
    name: 'Nhuộm tóc',
    slug: 'nhuom-toc',
    description: 'Nhuộm phủ bóng công nghệ Nano, màu thời trang tôn da, Balayage nghệ thuật và phủ bạc thảo dược.',
  },
  {
    id: '11111111-1111-1111-1111-111111111004',
    name: 'Uốn & duỗi',
    slug: 'uon-duoi',
    description: 'Uốn sóng lơi bồng bềnh chuẩn Hàn, uốn phồng chân tóc không nhiệt và duỗi hơi nước mềm mượt.',
  },
  {
    id: '11111111-1111-1111-1111-111111111005',
    name: 'Phục hồi',
    slug: 'phuc-hoi',
    description: 'Liệu trình phục hồi Keratin, Collagen chuyên sâu và tế bào gốc hồi sinh sợi tóc hư tổn.',
  },
];

// ─── Sample products ──────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: '22222222-2222-2222-2222-222222222001',
    category_id: '11111111-1111-1111-1111-111111111001',
    name: 'Cắt & tạo kiểu Layer hiện đại',
    slug: 'cat-tao-kieu-layer-hien-dai',
    description: 'Thiết kế dáng tóc Layer tầng bay bổng, ôm trọn gương mặt thanh thoát, sấy phồng tự nhiên theo phong cách Hàn Quốc.',
    price: 150000,
    image_url: '/images/studio/service-cut-layer.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222002',
    category_id: '11111111-1111-1111-1111-111111111001',
    name: 'Cắt tóc Bob / Pixie thời thượng',
    slug: 'cat-toc-bob-pixie-thoi-thuong',
    description: 'Đường cắt dứt khoát tôn góc cạnh và xương quai hàm, cá tính nhưng vẫn giữ nét mềm mại nữ tính.',
    price: 180000,
    image_url: '/images/studio/service-cut-bob.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222003',
    category_id: '11111111-1111-1111-1111-111111111001',
    name: 'Cắt tóc nam Side-part / Mullet hiện đại',
    slug: 'cat-toc-nam-side-part-mullet-hien-dai',
    description: 'Tạo phom tóc nam chỉn chu, tỉa texture sắc nét kết hợp cạo viền êm ái và gội xả sảng khoái.',
    price: 120000,
    image_url: '/images/studio/service-cut-men.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222004',
    category_id: '11111111-1111-1111-1111-111111111001',
    name: 'Tỉa mái bay / mái thưa & sấy bồng bềnh',
    slug: 'tia-mai-bay-mai-thua-say-bong-benh',
    description: 'Chỉnh lại độ dài mái thưa, mái bay mềm mại che khuyết điểm thái dương và trán hẹp.',
    price: 70000,
    image_url: '/images/studio/service-cut-bangs.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222005',
    category_id: '11111111-1111-1111-1111-111111111002',
    name: 'Gội đầu thảo dược dưỡng sinh',
    slug: 'goi-dau-thao-duoc-duong-sinh',
    description: 'Nấu nước bồ kết, sả chanh, hương nhu tươi tại chỗ kết hợp massage cổ vai gáy và ấn huyệt giải tỏa căng thẳng.',
    price: 90000,
    image_url: '/images/studio/service-wash-herbal.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222006',
    category_id: '11111111-1111-1111-1111-111111111002',
    name: 'Gội thư giãn thảo mộc cổ truyền',
    slug: 'goi-thu-gian-thao-moc-co-truyen',
    description: 'Làm sạch sâu da đầu, loại bỏ bã nhờn với dầu gội hữu cơ dịu nhẹ và sấy mát giữ nếp tự nhiên.',
    price: 60000,
    image_url: '/images/studio/service-wash-quick.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222007',
    category_id: '11111111-1111-1111-1111-111111111002',
    name: 'Thải độc da đầu & tẩy tế bào chết Nano',
    slug: 'thai-doc-da-dau-tay-te-bao-chet-nano',
    description: 'Thanh lọc nang tóc bị bít tắc do hóa chất và khói bụi, ngừa gàu ngứa và hỗ trợ tóc mọc dày khỏe.',
    price: 180000,
    image_url: '/images/studio/service-scalp-detox.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222008',
    category_id: '11111111-1111-1111-1111-111111111003',
    name: 'Nhuộm tone Nâu Trà Sữa Nano',
    slug: 'nhuom-tone-nau-tra-sua-nano',
    description: 'Gam màu nâu tây sáng da, công nghệ phủ bóng nano phân tử nhỏ giữ ánh màu óng ả và ít phai vàng.',
    price: 650000,
    image_url: '/images/studio/service-color-milktea.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222009',
    category_id: '11111111-1111-1111-1111-111111111003',
    name: 'Nhuộm Balayage & Ombre nghệ thuật',
    slug: 'nhuom-balayage-ombre-nghe-thuat',
    description: 'Kỹ thuật loang màu thủ công tinh xảo, hiệu ứng chuyển đổi tông màu mượt mà không lộ chân tóc khi mọc dài.',
    price: 950000,
    image_url: '/images/studio/service-color-balayage.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222010',
    category_id: '11111111-1111-1111-1111-111111111003',
    name: 'Chấm chân tóc & phủ bạc đồng màu',
    slug: 'cham-chan-toc-phu-bac-dong-mau',
    description: 'Xử lý đều màu chân tóc mới mọc hoặc phủ bạc thảo dược 100%, bảo đảm tiệp màu chuẩn xác với thân tóc.',
    price: 350000,
    image_url: '/images/studio/service-color-touchup.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222011',
    category_id: '11111111-1111-1111-1111-111111111004',
    name: 'Uốn sóng lơi Hàn Quốc nhẹ nhàng',
    slug: 'uon-song-loi-han-quoc-nhe-nhang',
    description: 'Tạo sóng nước mềm mại bồng bềnh tự nhiên, giữ nếp lâu dài mà không cần tạo kiểu cầu kỳ tại nhà.',
    price: 650000,
    image_url: '/images/studio/service-perm-wave.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222012',
    category_id: '11111111-1111-1111-1111-111111111004',
    name: 'Uốn phồng chân tóc không nhiệt',
    slug: 'uon-phong-chan-toc-khong-nhiet',
    description: 'Giải pháp hoàn hảo cho mái tóc mỏng xẹp, tạo độ phồng dày tự nhiên từ gốc tóc mà không bị gãy sợi.',
    price: 250000,
    image_url: '/images/studio/service-perm-root.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222013',
    category_id: '11111111-1111-1111-1111-111111111004',
    name: 'Duỗi cúp tự nhiên / duỗi hơi nước',
    slug: 'duoi-cup-tu-nhien-duoi-hoi-nuoc',
    description: 'Công nghệ duỗi hơi nước cấp ẩm sâu, tóc thẳng mượt vào nếp mềm mại, ngọn cúp nhẹ không bị đơ xơ.',
    price: 600000,
    image_url: '/images/studio/service-perm-straight.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222014',
    category_id: '11111111-1111-1111-1111-111111111005',
    name: 'Phục hồi Keratin & Collagen chuyên sâu',
    slug: 'phuc-hoi-keratin-collagen-chuyen-sau',
    description: 'Bổ sung chuỗi axit amin và dưỡng chất lấp đầy biểu bì hư tổn do uốn nhuộm nhiều lần, trả lại độ đàn hồi bóng mượt.',
    price: 450000,
    image_url: '/images/studio/service-treatment-keratin.jpg',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222015',
    category_id: '11111111-1111-1111-1111-111111111005',
    name: 'Liệu trình phủ bóng tế bào gốc',
    slug: 'lieu-trinh-phu-bong-te-bao-goc',
    description: 'Hồi sinh mái tóc chẻ ngọn và khô rối với tinh chất tế bào gốc thực vật, duy trì độ suôn mượt lâu dài.',
    price: 550000,
    image_url: '/images/studio/service-treatment-stemcell.jpg',
    status: 'active',
  },
];

// ─── Sample staff user ────────────────────────────────────────────────────────
const STAFF_USER = {
  id: '33333333-3333-3333-3333-333333333001',
  email: 'staff@example.com',
  password: 'Staff@123456',
  name: 'Nhân Viên Tư Vấn',
  role: 'staff',
};

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedCategories() {
  console.log('[Seed] Seeding categories...');
  const categories = jsonStore.getCollection('categories');
  let added = 0;
  for (const cat of CATEGORIES) {
    if (!categories.some(c => c.id === cat.id || c.slug === cat.slug)) {
      categories.push({
        ...cat,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      added++;
    }
  }
  jsonStore.saveCollection('categories', categories);
  console.log(`[Seed] ✓ ${categories.length} categories total (${added} new)`);
}

async function seedProducts() {
  console.log('[Seed] Seeding products...');
  const products = jsonStore.getCollection('products');
  let added = 0;
  for (const p of PRODUCTS) {
    if (!products.some(item => item.id === p.id || item.slug === p.slug)) {
      products.push({
        ...p,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      added++;
    }
  }
  jsonStore.saveCollection('products', products);
  console.log(`[Seed] ✓ ${products.length} products total (${added} new)`);
}

async function syncApprovedSalonCatalog() {
  const categoriesPath = path.join(__dirname, 'data', 'categories.json');
  const productsPath = path.join(__dirname, 'data', 'products.json');
  const approvedCategories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
  const approvedProducts = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

  const categories = jsonStore.getCollection('categories');
  for (const approved of approvedCategories) {
    const existing = categories.find(item => item.id === approved.id || item.slug === approved.slug);
    if (existing) Object.assign(existing, approved);
    else categories.push({ ...approved });
  }
  jsonStore.saveCollection('categories', categories);

  const products = jsonStore.getCollection('products');
  for (const approved of approvedProducts) {
    const existing = products.find(item => item.id === approved.id || item.slug === approved.slug);
    if (existing) Object.assign(existing, approved);
    else products.push({ ...approved });
  }
  jsonStore.saveCollection('products', products);
  console.log(`[Seed] ✓ Synchronized approved salon catalog (${approvedCategories.filter(c => c.is_active).length} active categories, ${approvedProducts.filter(p => p.status === 'active').length} active services)`);
}

async function seedStaffUser() {
  console.log('[Seed] Seeding staff user...');
  const users = jsonStore.getCollection('users');
  let staff = users.find(u => u.email.toLowerCase() === STAFF_USER.email.toLowerCase() || u.id === STAFF_USER.id);
  if (!staff) {
    const passwordHash = await bcrypt.hash(STAFF_USER.password, 10);
    const now = new Date().toISOString();
    staff = {
      id: STAFF_USER.id,
      email: STAFF_USER.email,
      password_hash: passwordHash,
      name: STAFF_USER.name,
      role: STAFF_USER.role,
      is_active: true,
      is_available: true,
      created_at: now,
      updated_at: now,
    };
    users.push(staff);
    jsonStore.saveCollection('users', users);
    console.log(`[Seed] ✓ Staff user created: ${STAFF_USER.email} / ${STAFF_USER.password}`);
  } else {
    console.log(`[Seed] Staff user already exists: ${STAFF_USER.email}`);
  }
}

async function seedBusinessSettings() {
  console.log('[Seed] Updating business settings...');
  const businessSettings = jsonStore.getCollection('business_settings');
  const contactIdx = businessSettings.findIndex(s => s.key === 'contact_info');
  const contactVal = {
    phone: '0901234567',
    email: 'contact@chatbox.vn',
    address: '123 Đường ABC, Quận 1, TP.HCM',
    facebook: 'https://facebook.com/chatbox',
    zalo: '0901234567',
  };
  if (contactIdx >= 0) {
    businessSettings[contactIdx].value = contactVal;
    businessSettings[contactIdx].updated_at = new Date().toISOString();
  } else {
    businessSettings.push({
      key: 'contact_info',
      value: contactVal,
      updated_at: new Date().toISOString(),
    });
  }
  jsonStore.saveCollection('business_settings', businessSettings);

  const sysSettings = jsonStore.getCollection('system_settings');
  const siteIdx = sysSettings.findIndex(s => s.key === 'site_name');
  if (siteIdx >= 0) {
    sysSettings[siteIdx].value = 'Chatbox Demo Store';
    sysSettings[siteIdx].updated_at = new Date().toISOString();
  } else {
    sysSettings.push({
      key: 'site_name',
      value: 'Chatbox Demo Store',
      is_public: true,
      updated_at: new Date().toISOString(),
    });
  }
  jsonStore.saveCollection('system_settings', sysSettings);
  console.log('[Seed] ✓ Business settings updated');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    console.log('[Seed] Starting seed process (Mock JSON)...');
    await runMigrations();

    await seedCategories();
    await seedProducts();
    await syncApprovedSalonCatalog();
    await seedStaffUser();
    await seedBusinessSettings();

    console.log('[Seed] ✅ All seed data inserted successfully!');
    console.log('[Seed] Demo credentials:');
    console.log(`  Staff: ${STAFF_USER.email} / ${STAFF_USER.password}`);
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
