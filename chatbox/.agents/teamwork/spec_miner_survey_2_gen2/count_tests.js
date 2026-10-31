const fs = require('fs');
const path = require('path');

const testsDir = path.resolve('tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));

const inventory = [];

files.forEach(file => {
  const filePath = path.join(testsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Find describes
  const describes = [];
  const describeRegex = /describe\s*\(\s*['"`](.*?)['"`]/g;
  let dMatch;
  while ((dMatch = describeRegex.exec(content)) !== null) {
    describes.push(dMatch[1]);
  }

  // Find tests
  const tests = [];
  const testRegex = /test\s*\(\s*['"`](.*?)['"`]/g;
  let tMatch;
  while ((tMatch = testRegex.exec(content)) !== null) {
    tests.push(tMatch[1]);
  }

  inventory.push({
    file,
    suites: describes,
    suiteCount: describes.length,
    testCount: tests.length,
    tests
  });
});

console.log(JSON.stringify(inventory, null, 2));
