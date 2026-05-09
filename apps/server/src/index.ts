import { buildApp } from './app';

const start = async () => {
  try {
    const app = await buildApp();
    
    await app.listen({
      port: app.config.PORT,
      host: '0.0.0.0'
    });
    
    app.log.info(`Server listening on http://localhost:${app.config.PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
