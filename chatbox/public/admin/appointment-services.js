'use strict';

const AppointmentServices = (() => {
  const PAGE_SIZE = 50;

  async function loadCatalog(api) {
    const services = [];
    let page = 1;
    let total = Infinity;

    while (services.length < total) {
      const response = await api(`/api/products?status=active&limit=${PAGE_SIZE}&page=${page}`);
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error('Phản hồi danh sách dịch vụ không hợp lệ.');
      }

      const pageServices = response.data.filter(service => service.status === 'active');
      total = Number.isFinite(Number(response.meta?.total))
        ? Number(response.meta.total)
        : page * PAGE_SIZE;
      if (pageServices.length === 0) {
        if (services.length < total) {
          throw new Error('Danh sách dịch vụ trả về không đầy đủ.');
        }
        break;
      }

      services.push(...pageServices);
      page++;
    }

    return services;
  }

  function calculateTotals(services, selectedIds, sizes = {}) {
    const selected = new Set(selectedIds);
    if (selected.size !== selectedIds.length) {
      throw new Error('Dịch vụ được chọn bị trùng.');
    }

    const productSizes = {};
    let duration = 0;
    let price = 0;
    const selectedServices = [];

    for (const id of selected) {
      const service = services.find(item => item.id === id && item.status === 'active');
      if (!service) {
        throw new Error('Một hoặc nhiều dịch vụ đã chọn không còn khả dụng.');
      }

      const tiers = service.prices_by_size || {};
      const size = sizes[id];
      if (!size || !Object.hasOwn(tiers, size)) {
        throw new Error(`Vui lòng chọn size hợp lệ cho dịch vụ ${service.name}.`);
      }

      const tier = tiers[size];
      const servicePrice = Number(tier?.price);
      const serviceDuration = Number(tier?.duration ?? service.duration);
      if (!Number.isFinite(servicePrice) || servicePrice <= 0 ||
          !Number.isInteger(serviceDuration) || serviceDuration <= 0) {
        throw new Error(`Dịch vụ ${service.name} thiếu giá hoặc thời lượng hợp lệ cho size ${size}.`);
      }

      productSizes[id] = size;
      price += servicePrice;
      duration += serviceDuration;
      selectedServices.push(service);
    }

    return { productSizes, price, duration, selectedServices };
  }

  function emptyMessage(services) {
    return services.length
      ? ''
      : 'Không có dịch vụ nào đang hoạt động và đủ điều kiện đặt lịch.';
  }

  return { loadCatalog, calculateTotals, emptyMessage };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppointmentServices;
}

if (typeof window !== 'undefined') {
  window.AppointmentServices = AppointmentServices;
}
