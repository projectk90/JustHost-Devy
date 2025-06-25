const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Proxy the iframe page with overlay removed
app.get('/video/*', async (req, res) => {
  const targetUrl = req.params[0];

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('Invalid or missing video URL.');
  }

  try {
    const response = await axios.get(targetUrl);
    const $ = cheerio.load(response.data);

    // Remove overlay
    $('#sharecloudy-fullcover-overlay').remove();

    // Rewrite m3u8 URLs to route through our proxy
    $('source[src$=".m3u8"]').each((i, elem) => {
      const originalUrl = $(elem).attr('src');
      if (originalUrl) {
        // Encode original URL for proxy route
        const proxiedUrl = `/proxy/${encodeURIComponent(originalUrl)}`;
        $(elem).attr('src', proxiedUrl);
      }
    });

    res.set('Content-Type', 'text/html');
    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching or processing the video page.');
  }
});

// 2. Proxy media files (.m3u8, .ts, etc.)
app.use(
  '/proxy',
  createProxyMiddleware({
    target: '', // target will be dynamically set in onProxyReq
    changeOrigin: true,
    selfHandleResponse: false,
    pathRewrite: (path, req) => {
      // /proxy/https%3A%2F%2Fexample.com%2Fvideo.m3u8  --> decode URL
      const encodedUrl = path.replace(/^\/proxy\//, '');
      const decodedUrl = decodeURIComponent(encodedUrl);
      req.url = new URL(decodedUrl).pathname + new URL(decodedUrl).search;
      return req.url;
    },
    router: (req) => {
      // Dynamically route to the original host extracted from the URL
      const encodedUrl = req.url.startsWith('/proxy/')
        ? req.url.replace('/proxy/', '')
        : req.url;
      const decodedUrl = decodeURIComponent(encodedUrl);
      const urlObj = new URL(decodedUrl);
      return urlObj.origin;
    },
    onProxyReq: (proxyReq, req, res) => {
      // Optionally add headers like Referer or User-Agent here if needed
      proxyReq.setHeader('Referer', 'https://sharecloudy.com');
      proxyReq.setHeader('Origin', 'https://sharecloudy.com');
    },
  })
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
