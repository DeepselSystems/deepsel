export default async function globalTeardown(): Promise<void> {
  const backend = globalThis.__e2eBackend;
  if (backend && !backend.killed) {
    console.log('[e2e teardown] stopping backend...');
    backend.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        backend.kill('SIGKILL');
        resolve();
      }, 5000);
      backend.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  const pg = globalThis.__e2ePostgres;
  if (pg) {
    console.log('[e2e teardown] stopping Postgres testcontainer...');
    await pg.stop();
  }
}
