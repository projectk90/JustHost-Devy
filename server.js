const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  // Allow CORS on all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Proxy endpoint for iframe page or any URL ?url=
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url param');

  try {
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send('Failed to fetch URL');

    // If it is an m3u8 playlist, rewrite .ts URLs to proxy
    if (url.endsWith('.m3u8')) {
      let playlist = await response.text();

      // Rewrite every .ts URL to go through this proxy
      playlist = playlist.replace(/(.*\.ts)/g, (match) => {
        const absoluteUrl = new URL(match, url).href;  // handle relative URLs
        return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(playlist);
    }

    // For other content types (e.g. ts segments), just pipe the bytes
    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType);

    // Stream binary content (ts segments)
    response.body.pipe(res);

  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
