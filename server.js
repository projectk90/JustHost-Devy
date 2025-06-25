const express = require('express');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const PORT = process.env.PORT || 3000;

// 1. Endpoint to accept sharecloudy iframe URL, fetch its HTML, extract .m3u8 link
app.get('/get-m3u8', async (req, res) => {
  const iframeUrl = req.query.url;
  if (!iframeUrl) return res.status(400).send('Missing url parameter');

  try {
    // Fetch iframe page HTML
    const response = await axios.get(iframeUrl);
    const html = response.data;

    // Extract .m3u8 URL (basic regex, may need tweaking based on actual iframe source)
    const m3u8Match = html.match(/https?:\/\/[^"']+\.m3u8/);
    if (!m3u8Match) return res.status(404).send('No m3u8 found');

    const m3u8Url = m3u8Match[0];

    // Return the proxied URL to the client
    // Client will request /proxy?url=actual_m3u8_url to play the video with CORS bypass
    res.json({ proxiedM3u8Url: `/proxy?url=${encodeURIComponent(m3u8Url)}` });

  } catch (e) {
    console.error(e);
    res.status(500).send('Error fetching iframe page');
  }
});

// 2. Proxy middleware to stream .m3u8 and .ts files with CORS headers
app.use('/proxy', createProxyMiddleware({
  target: 'http://dummy', // target will be rewritten dynamically
  changeOrigin: true,
  selfHandleResponse: false,
  router: (req) => {
    // Extract the real target from the ?url= query param
    const url = req.query.url;
    if (!url) return 'http://dummy'; // fallback

    // Return just the origin to satisfy http-proxy-middleware (it will proxy full url via pathRewrite)
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  },
  pathRewrite: (path, req) => {
    // Strip /proxy and remove ?url=... param from path, then proxy the full URL path
    const url = req.query.url;
    if (!url) return path;

    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  },
  onProxyRes: (proxyRes, req, res) => {
    // Add CORS headers to every proxied response
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
  },
}));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
