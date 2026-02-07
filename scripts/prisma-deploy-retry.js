const { spawn } = require('child_process');

const maxAttempts = 5;
const delayMs = 5000;

const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const runDeploy = () =>
  new Promise((resolve, reject) => {
    const proc = spawn(NPX_BIN, ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy failed with code ${code}`));
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`Prisma deploy attempt ${attempt}/${maxAttempts}`);
      await runDeploy();
      process.exit(0);
    } catch (error) {
      console.error(error.message);
      if (attempt === maxAttempts) {
        process.exit(1);
      }
      await sleep(delayMs);
    }
  }
}

main();
