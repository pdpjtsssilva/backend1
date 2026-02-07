const { spawn } = require('child_process');

const maxAttempts = 5;
const delayMs = 5000;

const NPX_CMD = 'npx prisma migrate deploy';

const runDeploy = () =>
  new Promise((resolve, reject) => {
    const proc = spawn(NPX_CMD, {
      stdio: 'inherit',
      shell: true,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy failed with code ${code}`));
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (process.env.SKIP_PRISMA_DEPLOY === '1') {
    console.log('SKIP_PRISMA_DEPLOY=1 set, skipping prisma migrate deploy.');
    process.exit(0);
  }

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
