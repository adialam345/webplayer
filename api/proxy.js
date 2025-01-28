// api/proxy.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  try {
    const encodedUrl = req.query.url;
    if (!encodedUrl) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }
    
    // Safely decode URL - try both single and double decoding
    let targetUrl;
    try {
      // First try single decode
      targetUrl = decodeURIComponent(encodedUrl);
      // Check if it needs another decode
      if (targetUrl.includes('%25')) {
        targetUrl = decodeURIComponent(targetUrl);
      }
    } catch (e) {
      console.error('URL decode error:', e);
      return res.status(400).json({ error: 'Invalid URL encoding' });
    }

    // Prevent proxy loops
    if (targetUrl.includes('/api/proxy')) {
      return res.status(400).json({ error: 'Proxy loop detected' });
    }

    console.log('Fetching URL:', targetUrl);
    
    const response = await fetch(targetUrl, {
      headers: {
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const content = await response.text();
    
    // Set comprehensive CORS and content headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    // Set content type based on the URL
    const contentType = targetUrl.endsWith('.m3u8') ? 
      'application/vnd.apple.mpegurl' : 
      'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    // If this is an m3u8 file, rewrite the URLs
    if (contentType === 'application/vnd.apple.mpegurl') {
      const modifiedContent = content.replace(
        /(https?:\/\/[^"\n\s]+)/g,
        (match) => {
          // Skip if already proxied
          if (match.includes('/api/proxy')) return match;
          return `/api/proxy?url=${encodeURIComponent(match)}`;
        }
      );
      return res.send(modifiedContent);
    }
    
    return res.send(content);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
    externalResolver: true
  }
};