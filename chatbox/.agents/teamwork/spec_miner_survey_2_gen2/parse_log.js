const fs = require('fs');
const content = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/d656a73c-e065-4389-9497-9337c2c88316/.system_generated/tasks/task-56.log', 'utf8');
const lines = content.split('\n');
const results = lines.filter(l => l.includes('# Subtest:') || l.startsWith('ok ') || l.startsWith('not ok '));
console.log(results.join('\n'));
