import express from 'express';
import path from 'path';
import fs from 'fs';
import { handleProxyRequest } from './server/proxyHandler.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const rootDir = process.cwd();

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // API endpoints for WebView proxy and diagnostics
  app.all('/api/proxy', async (req, res) => {
    await handleProxyRequest(req, res);
  });

  app.get('/api/info', async (req, res) => {
    await handleProxyRequest(req, res);
  });

  // Intercept any direct Blogger paths (posts, search, labels, feeds)
  app.all(/^\/(20\d\d|search|p|feeds|favicon\.ico).*/, async (req, res) => {
    await handleProxyRequest(req, res);
  });

  // Serve public assets (such as ad video sample)
  app.use(express.static(path.join(rootDir, 'public')));
  app.get('/ad-video.mp4', (req, res) => {
    const videoPath = path.join(rootDir, 'public', 'ad-video.mp4');
    if (fs.existsSync(videoPath)) {
      res.sendFile(videoPath);
    } else {
      res.status(404).send('Ad video placeholder');
    }
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(rootDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HDSKay WebView server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
