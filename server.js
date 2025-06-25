const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Allow CORS everywhere
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Main page: takes ?url=iframeURL, extracts m3u8, serves HLS player
app.get('/', async (req, res) => {
  const iframeUrl = req.query.url;
  if (!iframeUrl) return res.status(400).send('Add ?url=your_iframe_url');

  try {
    const html = await (await fetch(iframeUrl)).text();
    const m3u8 = html.match(/https?:\/\/[^"']+\.m3u8/);
    if (!m3u8) return res.status(404).send('No m3u8 found');

    const m3u8Url = m3u8[0];
    res.send(`
      <html><body>
        <video id="video" controls autoplay style="width:100%;max-width:800px;"></video>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        <script>
          const video=document.getElementById('video');
          const hls=new Hls();
          hls.loadSource('/proxy?url='+encodeURIComponent('${m3u8Url}'));
          hls.attachMedia(video);
        </script>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// Proxy handler for m3u8 and ts fetches
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');

  try {
    const upstream = await fetch(url, {
      headers: { Referer: 'https://sharecloudy.com', Origin: 'https://sharecloudy.com' }
    });
    if (!upstream.ok) return res.status(upstream.status).send('Upstream failed');

    const contentType = upstream.headers.get('content-type') || '';
    res.setHeader('Content-Type', contentType);

    if (url.endsWith('.m3u8')) {
      let body = await upstream.text();
      body = body.replace(/(.*\\.ts)/g, match => {
        const segmentUrl = new URL(match, url).href;
        return '/proxy?url=' + encodeURIComponent(segmentUrl);
      });
      return res.send(body);
    }

    // `.ts` or others: stream binary directly
    upstream.body.pipe(res);
  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
});

app.listen(PORT, () => console.log(`🎬 Proxy running at port ${PORT}`));
