'use strict';
const AIService = require('./AIService');

// Singleton instance của AIService cho toàn bộ ứng dụng
const aiService = new AIService();

module.exports = aiService;
