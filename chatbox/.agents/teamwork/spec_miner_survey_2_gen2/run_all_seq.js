const { execSync } = require('child_process');
const fs = require('fs');

const files = fs.readdirSync('tests').filter(f => f.endsWith('.test.js'));
const results = [];

for (const file of files) {
  try {
    const output = execSync(`node --test tests/${file}`, { encoding: 'utf8', timeout: 35000 });
    const passMatch = output.match(/# pass (\d+)/);
    const failMatch = output.match(/# fail (\d+)/);
    const passes = passMatch ? parseInt(passMatch[1], 10) : 0;
    const fails = failMatch ? parseInt(failMatch[1], 10) : 0;
    results.push({ file, status: fails === 0 ? 'PASS' : 'FAIL', passes, fails });
    console.log(`${file}: PASS (${passes}/${passes + fails})`);
  } catch (err) {
    const output = err.stdout || err.message;
    const passMatch = output.match(/# pass (\d+)/);
    const failMatch = output.match(/# fail (\d+)/);
    const passes = passMatch ? parseInt(passMatch[1], 10) : 0;
    const fails = failMatch ? parseInt(failMatch[1], 10) : 1;
    results.push({ file, status: 'FAIL', passes, fails, errorSnippet: err.message.slice(0, 150) });
    console.log(`${file}: FAIL (passed ${passes}, failed ${fails})`);
  }
}

console.log(JSON.stringify(results, null, 2));
