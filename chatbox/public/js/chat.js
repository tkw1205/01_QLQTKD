// Chat Widget & Real-time Integration
class ChatWidget {
  constructor() {
    this.conversation = null;
    this.socket = null;
    this.isOpen = false;
    this.isProcessing = false;
    this.productContextId = null;
    this.renderedMessageIds = new Set();

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.fab = document.getElementById('chat-fab');
    this.window = document.getElementById('chat-window');
    this.navToggle = document.getElementById('nav-toggle');
    this.navMenu = document.getElementById('nav-menu');
    this.btnClose = document.getElementById('btn-close-chat');
    this.messagesContainer = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input');
    this.btnSend = document.getElementById('btn-send');
    this.btnSwitchAgent = document.getElementById('btn-switch-agent');
    this.btnSwitchAI = document.getElementById('btn-switch-ai');
    this.statusBar = document.getElementById('chat-status-bar');
    this.statusText = document.getElementById('chat-status-text');
    this.modeBadge = document.getElementById('chat-mode-badge');
    this.typingIndicator = document.getElementById('typing-indicator');
    this.closedBanner = document.getElementById('closed-session-banner');
  }

  bindEvents() {
    if (this.navToggle && this.navMenu) {
      this.navToggle.addEventListener('click', () => {
        const isOpen = this.navMenu.classList.toggle('open');
        this.navToggle.setAttribute('aria-expanded', String(isOpen));
      });
      this.navMenu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
          this.navMenu.classList.remove('open');
          this.navToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const productButton = event.target.closest('[data-chat-product-id]');
      if (productButton) {
        this.openChat(productButton.dataset.chatProductId);
        return;
      }

      if (event.target.closest('[data-open-chat]')) {
        this.openChat();
      }
    });

    if (this.fab) {
      this.fab.addEventListener('click', () => this.toggleChat());
    }
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.closeChat());
    }
    if (this.btnSend) {
      this.btnSend.addEventListener('click', (e) => {
        e.preventDefault();
        if (!this.isProcessing) this.sendMessage();
      });
    }
    if (this.input) {
      this.input.addEventListener('input', () => this.adjustInputHeight());
      this.input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!this.isProcessing) {
            this.sendMessage();
          }
        }
      });
    }
    if (this.btnSwitchAgent) {
      this.btnSwitchAgent.addEventListener('click', () => this.requestAgent());
    }
    if (this.btnSwitchAI) {
      this.btnSwitchAI.addEventListener('click', () => this.switchToAI());
    }
  }

  async toggleChat() {
    if (this.isOpen) {
      this.closeChat();
    } else {
      await this.openChat();
    }
  }

  async openChat(productId = null) {
    const productChanged = productId !== null && productId !== this.productContextId;
    if (productId !== null) this.productContextId = productId;

    this.isOpen = true;
    if (this.window) this.window.classList.add('open');
    if (!this.conversation || productChanged) {
      await this.loadConversation();
    }
    this.scrollToBottom();
    this.focusInput();
  }

  focusInput() {
    if (!this.input) return;
    try {
      this.input.focus({ preventScroll: true });
    } catch (e) {
      this.input.focus();
    }
  }

  adjustInputHeight() {
    if (!this.input) return;
    this.input.style.height = 'auto';
    const scrollH = this.input.scrollHeight;
    if (scrollH > 38) {
      this.input.style.height = Math.min(scrollH, 100) + 'px';
    } else {
      this.input.style.height = '38px';
    }
  }

  closeChat() {
    this.isOpen = false;
    if (this.window) this.window.classList.remove('open');
  }

  initSocket() {
    if (this.socket) {
      if (this.socket.connected && this.conversation) {
        this.socket.emit('join_conversation', {
          conversationId: this.conversation.id,
          guestSession: this.conversation.guest_session_id
        });
      }
      return;
    }
    if (typeof io === 'undefined') {
      console.warn('Socket.IO client not loaded');
      return;
    }

    this.socket = io({
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: {
        guestSession: this.conversation ? this.conversation.guest_session_id : undefined
      }
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server, id:', this.socket.id);
      if (this.conversation) {
        this.socket.emit('join_conversation', {
          conversationId: this.conversation.id,
          guestSession: this.conversation.guest_session_id
        });
      }
    });

    this.socket.on('joined_conversation', (data) => {
      console.log('[Socket] Joined conversation room:', data.conversationId);
    });

    this.socket.on('new_message', (msg) => {
      if (!msg) return;

      // 1. If message already rendered by ID, ignore immediately
      if (msg.id && this.renderedMessageIds.has(msg.id)) {
        return;
      }

      // 2. If it's a user message, reconcile with optimistic element
      if (msg.sender_type === 'user') {
        // 2a. Match by client message ID
        if (msg.client_message_id) {
          const optimisticEl = this.messagesContainer?.querySelector(`[data-client-id="${msg.client_message_id}"]`);
          if (optimisticEl) {
            if (msg.id) {
              optimisticEl.setAttribute('data-msg-id', msg.id);
              this.renderedMessageIds.add(msg.id);
            }
            return;
          }
        }

        // 2b. Match by raw text content among pending optimistic messages (no data-msg-id)
        if (this.messagesContainer) {
          const userRows = this.messagesContainer.querySelectorAll('.msg-row.user');
          for (let i = userRows.length - 1; i >= 0; i--) {
            const row = userRows[i];
            if (!row.getAttribute('data-msg-id') && row.dataset.rawContent === msg.content) {
              if (msg.id) {
                row.setAttribute('data-msg-id', msg.id);
                this.renderedMessageIds.add(msg.id);
              }
              return;
            }
          }
        }
      }

      this.appendMessage(msg);
      this.scrollToBottom();
    });

    this.socket.on('agent_joined', (data) => {
      console.log('[Socket] Agent joined conversation:', data);
      this.updateMode('human', data.agentName);
      this.appendMessage({
        sender_type: 'system',
        content: `Nhân viên ${data.agentName || 'tư vấn'} đã tiếp nhận cuộc hội thoại. Bạn có thể trò chuyện trực tiếp ngay bây giờ.`,
        created_at: new Date().toISOString()
      });
      this.scrollToBottom();
    });

    this.socket.on('mode_changed', (data) => {
      this.updateMode(data.mode);
    });

    this.socket.on('new_conversation_created', (data) => {
      if (data && data.newConversation) {
        this.conversation = data.newConversation;
        this.updateMode(this.conversation.mode);
        if (data.greeting) this.appendMessage(data.greeting);
        if (data.message) this.appendMessage(data.message);
        this.scrollToBottom();
      }
    });

    this.socket.on('conversation_closed', () => {
      this.updateMode('closed');
      this.appendMessage({
        sender_type: 'system',
        content: 'Phiên tư vấn đã kết thúc do hết thời gian chờ phản hồi. Bạn có thể gửi tin nhắn mới bất kỳ lúc nào để bắt đầu phiên mới.',
        created_at: new Date().toISOString()
      });
      this.scrollToBottom();
    });

    this.socket.on('typing', (data) => {
      if (this.typingIndicator) {
        if (data.isTyping) {
          this.typingIndicator.classList.add('show');
        } else {
          this.typingIndicator.classList.remove('show');
        }
      }
    });

    this.socket.on('error', (err) => {
      console.warn('[Socket] Server emitted error:', err);
    });
  }

  async loadConversation() {
    try {
      let url = '/api/conversations/current';
      if (this.productContextId) {
        url += `?productId=${encodeURIComponent(this.productContextId)}`;
      }
      const res = await API.get(url);
      if (res.success && res.data) {
        this.conversation = res.data.conversation;
        this.updateMode(this.conversation.mode, this.conversation.agent_name);
        this.renderMessages(res.data.messages || []);
        this.initSocket();
        if (this.socket && this.socket.connected) {
          this.socket.emit('join_conversation', {
            conversationId: this.conversation.id,
            guestSession: this.conversation.guest_session_id
          });
        }
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      API.showToast('Không thể tải cuộc hội thoại', 'error');
    }
  }

  updateMode(mode, agentName = null) {
    if (!this.conversation) return;
    this.conversation.mode = mode;

    if (this.modeBadge) {
      if (mode === 'ai') {
        this.modeBadge.textContent = 'Trợ lý AI';
        this.modeBadge.className = 'badge badge-primary';
      } else if (mode === 'waiting_for_agent') {
        this.modeBadge.textContent = 'Đang chờ nhân viên';
        this.modeBadge.className = 'badge badge-warning';
      } else if (mode === 'human') {
        this.modeBadge.textContent = `Chuyên viên: ${agentName || 'Hỗ trợ'}`;
        this.modeBadge.className = 'badge badge-success';
      } else if (mode === 'closed') {
        this.modeBadge.textContent = 'Đã kết thúc';
        this.modeBadge.className = 'badge badge-secondary';
      }
    }

    if (this.closedBanner) {
      if (mode === 'closed') {
        this.closedBanner.classList.add('show');
      } else {
        this.closedBanner.classList.remove('show');
      }
    }

    if (this.input) {
      this.input.disabled = false;
      if (mode === 'closed') {
        this.input.placeholder = 'Nhập tin nhắn để bắt đầu phiên mới cùng Salon Lumière...';
      } else {
        this.input.placeholder = 'Nhập câu hỏi hoặc yêu cầu đặt lịch làm tóc...';
      }
    }

    if (this.statusBar && this.statusText) {
      if (mode === 'waiting_for_agent') {
        this.statusBar.classList.add('show');
        this.statusText.textContent = 'Đang tìm chuyên viên tư vấn hỗ trợ bạn...';
      } else if (mode === 'human') {
        this.statusBar.classList.add('show');
        this.statusText.textContent = `Đang chat trực tiếp với ${agentName || 'chuyên viên tư vấn'}`;
      } else {
        this.statusBar.classList.remove('show');
      }
    }

    // Toggle switch buttons
    if (this.btnSwitchAgent && this.btnSwitchAI) {
      if (mode === 'ai') {
        this.btnSwitchAgent.style.display = 'block';
        this.btnSwitchAI.style.display = 'none';
      } else if (mode === 'waiting_for_agent' || mode === 'human') {
        this.btnSwitchAgent.style.display = 'none';
        this.btnSwitchAI.style.display = 'block';
      } else {
        this.btnSwitchAgent.style.display = 'none';
        this.btnSwitchAI.style.display = 'none';
      }
    }
  }

  renderMessages(messages) {
    if (!this.messagesContainer) return;
    this.renderedMessageIds.clear();
    this.messagesContainer.innerHTML = '';
    
    if (!messages || messages.length === 0) {
      this.appendMessage({
        sender_type: 'assistant',
        content: 'Xin chào! Em là Trợ lý AI của Salon Lumière. Em có thể tư vấn các gói dịch vụ làm tóc và hỗ trợ anh/chị đặt lịch hẹn nhanh chóng. Anh/chị cần em hỗ trợ gì hôm nay ạ?',
        created_at: new Date().toISOString()
      });
      return;
    }

    messages.forEach((msg) => this.appendMessage(msg));
    this.scrollToBottom();
  }

  appendMessage(msg) {
    if (!this.messagesContainer || !msg) return;

    // Deduplicate by message ID if present
    if (msg.id) {
      if (this.renderedMessageIds.has(msg.id)) return;
      this.renderedMessageIds.add(msg.id);
    }

    if (msg.sender_type === 'system') {
      const row = document.createElement('div');
      row.className = 'msg-system-row';
      if (msg.id) row.setAttribute('data-msg-id', msg.id);
      row.innerHTML = `<span>${this.escapeHtml(msg.content)}</span>`;
      this.messagesContainer.appendChild(row);
      return;
    }

    const row = document.createElement('div');
    const isUser = msg.sender_type === 'user';
    row.className = `msg-row ${isUser ? 'user' : ''}`;
    if (msg.id) row.setAttribute('data-msg-id', msg.id);
    if (msg.client_message_id) row.setAttribute('data-client-id', msg.client_message_id);
    row.dataset.rawContent = msg.content || '';

    let avatarClass = 'ai';
    let avatarText = 'AI';
    let senderTitle = 'Trợ lý AI';

    if (isUser) {
      avatarClass = 'user';
      avatarText = 'Bạn';
      senderTitle = 'Bạn';
    } else if (msg.sender_type === 'agent') {
      avatarClass = 'agent';
      avatarText = 'NV';
      senderTitle = msg.agent_name || 'Nhân viên';
    }

    const time = msg.created_at ? API.formatTime(new Date(msg.created_at).toTimeString()) : '';

    row.innerHTML = `
      <div class="msg-avatar ${avatarClass}">${avatarText}</div>
      <div class="msg-bubble ${msg.sender_type}">
        ${!isUser ? `<div class="msg-sender-name">${senderTitle}</div>` : ''}
        <div class="msg-content">${this.formatContent(msg.content)}</div>
        <div class="msg-time">${time}</div>
      </div>
    `;

    this.messagesContainer.appendChild(row);
  }

  formatContent(text) {
    if (!text) return '';
    const escaped = this.escapeHtml(text);
    return escaped.replace(/\n/g, '<br>');
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  async sendMessage() {
    if (this.isProcessing) return;
    const content = this.input ? this.input.value.trim() : '';
    if (!content) return;

    // Synchronous immediate lock
    this.isProcessing = true;
    if (this.btnSend) this.btnSend.disabled = true;
    this.input.value = '';
    this.adjustInputHeight();

    const clientMsgId = 'cmsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    try {
      if (!this.conversation) {
        await this.loadConversation();
      }

      // Append user message optimistically with client identifier and raw text
      const userMsg = {
        client_message_id: clientMsgId,
        sender_type: 'user',
        content,
        created_at: new Date().toISOString()
      };
      this.appendMessage(userMsg);
      this.scrollToBottom();

      if (this.conversation.mode === 'ai' || this.conversation.mode === 'closed') {
        // Show typing indicator
        if (this.typingIndicator) this.typingIndicator.classList.add('show');
        
        const res = await API.post(`/api/conversations/${this.conversation.id}/chat`, {
          message: content,
          clientMessageId: clientMsgId
        });

        if (this.typingIndicator) this.typingIndicator.classList.remove('show');

        if (res.success && res.data) {
          // Handle auto-spawned new conversation when messaging closed session (CR-05)
          if (res.data.isNewSession && res.data.conversation) {
            this.conversation = res.data.conversation;
            this.updateMode(this.conversation.mode, this.conversation.agent_name);
            if (this.socket && this.socket.connected) {
              this.socket.emit('join_conversation', {
                conversationId: this.conversation.id,
                guestSession: this.conversation.guest_session_id
              });
            }
            if (res.data.greeting) {
              this.appendMessage(res.data.greeting);
            }
            API.showToast('Đã bắt đầu phiên tư vấn mới cùng Salon Lumière', 'info');
          }
          if (res.data.message && !res.data.duplicate) {
            this.appendMessage(res.data.message);
          }
          this.scrollToBottom();
        }
      } else {
        // Human or waiting mode -> send via standard message endpoint or socket
        if (this.socket && this.socket.connected) {
          this.socket.emit('guest_message', {
            conversationId: this.conversation.id,
            content,
            clientMessageId: clientMsgId
          });
        } else {
          const res = await API.post(`/api/conversations/${this.conversation.id}/message`, {
            message: content,
            clientMessageId: clientMsgId
          });
          if (res.success && res.data && res.data.id) {
            // Find optimistic message and update its ID
            const optimisticEl = this.messagesContainer?.querySelector(`[data-client-id="${clientMsgId}"]`);
            if (optimisticEl) {
              optimisticEl.setAttribute('data-msg-id', res.data.id);
              this.renderedMessageIds.add(res.data.id);
            }
          }
        }
      }
    } catch (err) {
      if (this.typingIndicator) this.typingIndicator.classList.remove('show');
      API.showToast(err.message || 'Lỗi gửi tin nhắn', 'error');
    } finally {
      this.isProcessing = false;
      if (this.btnSend) this.btnSend.disabled = false;
      this.focusInput();
    }
  }

  async requestAgent() {
    if (!this.conversation) return;
    try {
      const res = await API.post(`/api/conversations/${this.conversation.id}/switch-to-agent`);
      if (res.success) {
        this.updateMode('waiting_for_agent');
        this.appendMessage({
          sender_type: 'system',
          content: 'Bạn đã yêu cầu chuyển sang nhân viên tư vấn. Vui lòng chờ trong giây lát...',
          created_at: new Date().toISOString()
        });
        this.scrollToBottom();
        API.showToast('Đã gửi yêu cầu kết nối với nhân viên', 'success');
      }
    } catch (err) {
      API.showToast(err.message || 'Không thể chuyển kênh chat', 'error');
    }
  }

  async switchToAI() {
    if (!this.conversation) return;
    try {
      const res = await API.post(`/api/conversations/${this.conversation.id}/switch-to-ai`);
      if (res.success) {
        this.updateMode('ai');
        this.appendMessage({
          sender_type: 'system',
          content: 'Bạn đã chuyển lại chế độ chat cùng Trợ lý AI.',
          created_at: new Date().toISOString()
        });
        this.scrollToBottom();
        API.showToast('Đã quay lại chat với AI', 'info');
      }
    } catch (err) {
      API.showToast(err.message || 'Không thể chuyển về AI', 'error');
    }
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.chatWidget = new ChatWidget();
});
