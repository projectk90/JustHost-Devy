const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const PROXY_PREFIX = '/proxy'; // Proxy URL prefix
const TARGET_HOST = 'https://share32146.sharecloudy.com'; // The real source

app.use(PROXY_PREFIX, createProxyMiddleware({
  target: TARGET_HOST,
  changeOrigin: true,
  selfHandleResponse: true, // So we can modify the playlist body
  onProxyRes: (proxyRes, req, res) => {
    let bodyChunks = [];

    proxyRes.on('data', (chunk) => {
      bodyChunks.push(chunk);
    });

    proxyRes.on('end', () => {
      let body = Buffer.concat(bodyChunks);
      let contentType = proxyRes.headers['content-type'] || '';

      // If it's an m3u8 playlist, rewrite URLs inside
      if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL')) {
        let playlist = body.toString('utf8');

        // Build the base URL for proxying (your server URL + /proxy)
        const protocol = req.protocol;
        const host = req.get('host');
        const baseProxyUrl = `${protocol}://${host}${PROXY_PREFIX}`;

        // Replace all absolute URLs that start with TARGET_HOST with your proxy URL
        const targetHostEscaped = TARGET_HOST.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const absoluteUrlRegex = new RegExp(targetHostEscaped, 'g');
        playlist = playlist.replace(absoluteUrlRegex, baseProxyUrl);

        // Rewrite relative URLs to full proxy URLs
        playlist = playlist.replace(/^([^#][^\r\n]*)$/gm, (line) => {
          // If line is a full URL or a comment, leave it as is
          if (line.startsWith('http') || line.startsWith('#')) return line;

          // Compose proxy path for the segment relative to current path
          const basePath = req.path.substring(0, req.path.lastIndexOf('/') + 1);
          return `${baseProxyUrl}${basePath}${line}`;
        });

        body = Buffer.from(playlist, 'utf8');
      }

      // Copy all headers from original response to the client
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      res.status(proxyRes.statusCode).send(body);
    });
  },

  // Remove /proxy prefix when requesting the target server
  pathRewrite: (path) => path.replace(PROXY_PREFIX, ''),

  onProxyReq: (proxyReq) => {
    // Set headers to mimic requests from sharecloudy itself, helps avoid 403
    proxyReq.setHeader('Referer', 'https://sharecloudy.com');
    proxyReq.setHeader('Origin', 'https://sharecloudy.com');
  },
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});
