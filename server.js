import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { URL } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Helper function to get content type from URL
function getContentType(url) {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname.toLowerCase();
  
  if (pathname.endsWith('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  } else if (pathname.endsWith('.ts')) {
    return 'video/mp2t';
  } else if (pathname.endsWith('.mp4')) {
    return 'video/mp4';
  } else if (pathname.endsWith('.css')) {
    return 'text/css';
  } else if (pathname.endsWith('.js')) {
    return 'application/javascript';
  } else if (pathname.endsWith('.json')) {
    return 'application/json';
  } else if (pathname.endsWith('.png')) {
    return 'image/png';
  } else if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  } else if (pathname.endsWith('.gif')) {
    return 'image/gif';
  } else if (pathname.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  return 'text/html';
}

// Helper function to remove ShareCloudy overlay
function removeShareCloudyOverlay(html) {
  try {
    const $ = cheerio.load(html);
    
    // Remove the specific ShareCloudy overlay div
    $('#sharecloudy-fullcover-overlay').remove();
    
    // Also remove any other potential overlays with similar patterns
    $('div[style*="position: absolute"][style*="z-index: 2147483647"]').remove();
    $('div[style*="position: fixed"][style*="z-index: 2147483647"]').remove();
    
    // Remove any divs containing "GRASTREAM.COM" or similar redirect content
    $('div:contains("GRASTREAM.COM")').remove();
    $('div:contains("GRANDE NOUVELLE")').remove();
    
    return $.html();
  } catch (error) {
    console.warn('Error removing overlay:', error.message);
    return html;
  }
}

// Helper function to modify URLs in HTML content to use proxy
function modifyUrlsInContent(html, originalUrl) {
  try {
    const $ = cheerio.load(html);
    const baseUrl = new URL(originalUrl);
    const proxyBase = `http://localhost:${PORT}/proxy?url=`;
    
    // Modify script sources
    $('script[src]').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && !src.startsWith('http') && !src.startsWith('//')) {
        const absoluteUrl = new URL(src, baseUrl).href;
        $(elem).attr('src', proxyBase + encodeURIComponent(absoluteUrl));
      } else if (src && src.startsWith('//')) {
        const absoluteUrl = baseUrl.protocol + src;
        $(elem).attr('src', proxyBase + encodeURIComponent(absoluteUrl));
      } else if (src && src.startsWith('http')) {
        $(elem).attr('src', proxyBase + encodeURIComponent(src));
      }
    });
    
    // Modify CSS links
    $('link[rel="stylesheet"]').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && !href.startsWith('http') && !href.startsWith('//')) {
        const absoluteUrl = new URL(href, baseUrl).href;
        $(elem).attr('href', proxyBase + encodeURIComponent(absoluteUrl));
      } else if (href && href.startsWith('//')) {
        const absoluteUrl = baseUrl.protocol + href;
        $(elem).attr('href', proxyBase + encodeURIComponent(absoluteUrl));
      } else if (href && href.startsWith('http')) {
        $(elem).attr('href', proxyBase + encodeURIComponent(href));
      }
    });
    
    return $.html();
  } catch (error) {
    console.warn('Error modifying URLs:', error.message);
    return html;
  }
}

// Main proxy endpoint
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Missing URL parameter. Use: /proxy?url=https://example.com' 
    });
  }
  
  try {
    // Validate URL
    new URL(targetUrl);
    
    console.log(`Proxying request to: ${targetUrl}`);
    
    // Fetch the content
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...req.headers.referer && { 'Referer': req.headers.referer }
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || getContentType(targetUrl);
    
    // Handle different content types
    if (contentType.includes('text/html')) {
      // HTML content - remove overlay and modify URLs
      let html = await response.text();
      html = removeShareCloudyOverlay(html);
      html = modifyUrlsInContent(html, targetUrl);
      
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      
    } else if (contentType.includes('application/vnd.apple.mpegurl') || targetUrl.includes('.m3u8')) {
      // M3U8 playlist - modify URLs to use proxy
      let content = await response.text();
      const lines = content.split('\n');
      const baseUrl = new URL(targetUrl);
      const proxyBase = `http://localhost:${PORT}/proxy?url=`;
      
      const modifiedLines = lines.map(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          // This is a URL line
          if (line.startsWith('http')) {
            return proxyBase + encodeURIComponent(line);
          } else {
            // Relative URL
            const absoluteUrl = new URL(line, baseUrl).href;
            return proxyBase + encodeURIComponent(absoluteUrl);
          }
        }
        return line;
      });
      
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Access-Control-Allow-Origin', '*');
      res.send(modifiedLines.join('\n'));
      
    } else {
      // Other content types (TS files, CSS, JS, images, etc.) - pass through
      const buffer = await response.buffer();
      
      // Copy relevant headers
      ['content-type', 'content-length', 'cache-control', 'expires', 'last-modified', 'etag'].forEach(header => {
        const value = response.headers.get(header);
        if (value) {
          res.set(header, value);
        }
      });
      
      res.set('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch content', 
      message: error.message,
      url: targetUrl
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Proxy server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint with usage information
app.get('/', (req, res) => {
  res.json({
    message: 'Web Proxy Server',
    usage: {
      proxy: '/proxy?url=https://example.com',
      health: '/health'
    },
    features: [
      'Removes ShareCloudy overlays',
      'Supports M3U8 and TS streaming',
      'Handles all web content types',
      'CORS enabled'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`📖 Usage: http://localhost:${PORT}/proxy?url=https://example.com`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

export default app;
