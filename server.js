const express = require('express');
const fetch = require('node-fetch');
const app = express();

const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url param');

  try {
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send('Upstream error');

    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'application/octet-stream');

    // Handle .m3u8 playlist rewriting
    if (url.endsWith('.m3u8')) {
      let playlist = await response.text();
      playlist = playlist.replace(/(.*\.ts)/g, (match) => {
        const absoluteUrl = new URL(match, url).href;
        return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      });
      return res.send(playlist);
    }

    response.body.pipe(res);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on http://localhost:${PORT}`);
});
