'use strict';

window.ProductCatalog = {
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  renderPlaceholder(name, className = 'img-placeholder') {
    const initials = String(name || '')
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map(word => word[0] || '')
      .join('')
      .toLocaleUpperCase('vi-VN');
    return `<div class="${className}" role="img" aria-label="Chưa có ảnh minh họa cho ${this.escapeHtml(name || 'dịch vụ')}">${this.escapeHtml(initials || '—')}</div>`;
  },

  renderSizePrices(product) {
    const tiers = Object.entries(product.prices_by_size || {})
      .filter(([, tier]) => tier && Number.isFinite(Number(tier.price)) && Number(tier.price) > 0);
    if (!tiers.length) return '<p class="product-price-unavailable">Giá và size dịch vụ đang được cập nhật.</p>';

    const unit = product.price_unit === 'per_tap'
      ? '/tép'
      : product.price_unit
        ? (String(product.price_unit).startsWith('/') ? String(product.price_unit) : `/${product.price_unit}`)
        : '';
    const rows = tiers.map(([size, tier]) => `
      <tr>
        <td>${this.escapeHtml(size)}</td>
        <td>${this.escapeHtml(tier.description || tier.hair_type || tier.label || '—')}</td>
        <td>${this.escapeHtml(API.formatCurrency(tier.price))}${this.escapeHtml(unit)}</td>
        <td>${Number(tier.duration ?? product.duration) > 0 ? `${this.escapeHtml(tier.duration ?? product.duration)} phút` : 'Chưa cập nhật'}</td>
      </tr>
    `).join('');

    return `
      <table class="product-size-prices">
        <thead><tr><th>Size</th><th>Mô tả</th><th>Giá</th><th>Thời gian</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  renderCards(container, products) {
    if (!products.length) {
      container.innerHTML = '<div class="empty-state w-full" style="grid-column: 1 / -1;">Chưa có dịch vụ nào được hiển thị.</div>';
      return;
    }

    container.innerHTML = products.map(product => {
      const name = this.escapeHtml(product.name);
      const category = this.escapeHtml(product.category_name || 'Dịch vụ');
      const imageUrl = this.escapeHtml(product.image_url || '');
      const description = product.description ? this.escapeHtml(product.description) : '';
      const image = imageUrl
        ? `<img src="${imageUrl}" alt="${name}" loading="lazy">`
        : this.renderPlaceholder(product.name);

      return `
        <div class="card product-card">
          <div class="img-wrapper">
            ${image}
          </div>
          <div class="card-body">
            <div class="badge badge-info mb-1">${category}</div>
            <h3>${name}</h3>
            ${description ? `<p class="desc">${description}</p>` : ''}
            <div class="flex gap-1 mt-2 product-card-actions">
              <button class="btn btn-sm btn-primary flex-1" data-chat-product-id="${this.escapeHtml(product.id)}" style="justify-content: center;">Tư vấn ngay</button>
              <button type="button" class="btn btn-sm btn-outline flex-1" data-product-detail-id="${this.escapeHtml(product.id)}" aria-label="Xem chi tiết ${name}" style="justify-content: center;">Chi tiết</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.img-wrapper img').forEach(image => {
      image.addEventListener('error', () => {
        image.outerHTML = this.renderPlaceholder(image.alt);
      }, { once: true });
    });
    this.bindDetailsModal();
  },

  bindDetailsModal() {
    if (this.detailsModalBound) return;
    this.detailsModalBound = true;

    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const detailButton = event.target.closest('[data-product-detail-id]');
      if (detailButton) {
        this.openDetails(detailButton.dataset.productDetailId, detailButton);
        return;
      }

      if (event.target.closest('[data-product-modal-close]')) {
        this.closeDetails();
      }
    });

    document.addEventListener('click', event => {
      const overlay = document.getElementById('product-detail-modal-overlay');
      if (overlay && event.target === overlay) this.closeDetails();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeDetails();
    });
  },

  ensureDetailsModal() {
    let overlay = document.getElementById('product-detail-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'product-detail-modal-overlay';
    overlay.className = 'modal-overlay product-detail-modal-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="modal product-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-modal-title" tabindex="-1">
        <div class="modal-header">
          <h3 id="product-detail-modal-title">Chi tiết dịch vụ</h3>
          <button type="button" class="modal-close" data-product-modal-close aria-label="Đóng chi tiết">&times;</button>
        </div>
        <div class="modal-body product-detail-modal-body" aria-live="polite"></div>
        <div class="modal-footer product-detail-modal-footer">
          <button type="button" class="btn btn-primary" data-chat-product-id="">Tư vấn ngay</button>
          <button type="button" class="btn btn-secondary" data-product-modal-close>Đóng</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    return overlay;
  },

  async openDetails(productId, trigger) {
    const overlay = this.ensureDetailsModal();
    const modal = overlay.querySelector('.product-detail-modal');
    const body = overlay.querySelector('.product-detail-modal-body');
    const title = overlay.querySelector('#product-detail-modal-title');
    const consultButton = overlay.querySelector('[data-chat-product-id]');
    const requestId = (this.detailsRequestId || 0) + 1;
    this.detailsRequestId = requestId;
    this.detailsTrigger = trigger;
    title.textContent = 'Chi tiết dịch vụ';
    body.innerHTML = '<div class="product-detail-loading" role="status">Đang tải thông tin dịch vụ...</div>';
    consultButton.dataset.chatProductId = productId;
    consultButton.disabled = true;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    modal.focus();

    try {
      const response = await API.get(`/api/products/${encodeURIComponent(productId)}`);
      if (requestId !== this.detailsRequestId || !overlay.classList.contains('open')) return;
      if (!response.success || !response.data) {
        throw new Error('Không thể tải thông tin dịch vụ.');
      }
      const product = response.data;
      const name = this.escapeHtml(product.name || 'Dịch vụ');
      const image = product.image_url
        ? `<img class="product-detail-modal-image" src="${this.escapeHtml(product.image_url)}" alt="${name}">`
        : this.renderPlaceholder(product.name, 'product-detail-modal-image-placeholder');
      const duration = Number(product.duration) > 0 ? `${this.escapeHtml(product.duration)} phút` : 'Chưa cập nhật';
      const staffCount = Number(product.staff_count) > 0
        ? `${this.escapeHtml(product.staff_count)} nhân viên`
        : 'Chưa cập nhật';
      const description = product.description
        ? this.escapeHtml(product.description)
        : 'Chưa có mô tả chi tiết cho dịch vụ này.';
      title.textContent = product.name || 'Chi tiết dịch vụ';
      body.innerHTML = `
        <div class="product-detail-overview">
          <div class="product-detail-modal-image-wrap">${image}</div>
          <div class="product-detail-overview-content">
            <div class="badge badge-info mb-1">${this.escapeHtml(product.category_name || 'Dịch vụ')}</div>
            <h4>${name}</h4>
            <p class="product-detail-description">${description}</p>
            <dl class="product-detail-meta">
              <div><dt>Thời gian thực hiện</dt><dd>${duration}</dd></div>
              <div><dt>Nhân viên cần</dt><dd>${staffCount}</dd></div>
            </dl>
          </div>
        </div>
        <section class="product-detail-prices" aria-label="Bảng size và giá dịch vụ">
          <h4>Size và giá dịch vụ</h4>
          ${this.renderSizePrices(product)}
        </section>
      `;

      const imageElement = body.querySelector('.product-detail-modal-image');
      if (imageElement) {
        imageElement.addEventListener('error', () => {
          imageElement.outerHTML = this.renderPlaceholder(product.name, 'product-detail-modal-image-placeholder');
        }, { once: true });
      }
      consultButton.disabled = false;
      overlay.querySelector('[data-product-modal-close]').focus();
    } catch (error) {
      if (requestId !== this.detailsRequestId || !overlay.classList.contains('open')) return;
      body.innerHTML = `<div class="alert alert-danger" role="alert">${this.escapeHtml(error.message || 'Không thể tải thông tin dịch vụ.')}</div>`;
    }
  },

  closeDetails() {
    const overlay = document.getElementById('product-detail-modal-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    this.detailsRequestId = (this.detailsRequestId || 0) + 1;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (this.detailsTrigger?.isConnected) this.detailsTrigger.focus();
    this.detailsTrigger = null;
  },
};
