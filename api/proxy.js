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

    // Safely decode URL - handle YouTube's double encoding
    let targetUrl;
    try {
      // First try single decode
      targetUrl = decodeURIComponent(encodedUrl);
      // For YouTube URLs, we need to handle their special encoding
      if (targetUrl.includes('googlevideo.com')) {
        // Replace encoded characters specific to YouTube URLs
        targetUrl = targetUrl.replace(/(%252F)/g, '%2F')
                           .replace(/(%253D)/g, '%3D')
                           .replace(/(%253F)/g, '%3F')
                           .replace(/(%2526)/g, '%26');
      }
    } catch (e) {
      console.error('URL decode error:', e);
      return res.status(400).json({ error: 'Invalid URL encoding', details: e.message });
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      },
      redirect: 'follow',
      timeout: 10000 // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }

    const content = await response.text();
    
    // Set comprehensive CORS and content headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    // Set content type based on the URL and response headers
    const contentType = response.headers.get('content-type') || 
                       (targetUrl.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 
                       targetUrl.endsWith('.ts') ? 'video/mp2t' : 
                       'application/octet-stream');
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    // If this is an m3u8 file, rewrite the URLs
    if (contentType.includes('mpegurl')) {
      const modifiedContent = content.replace(
        /(https?:\/\/[^"\n\s]+)/g,
        (match) => {
          // Skip if already proxied
          if (match.includes('/api/proxy')) return match;
          // Ensure proper encoding for YouTube URLs
          const encodedMatch = encodeURIComponent(match);
          return `/api/proxy?url=${encodedMatch}`;
        }
      );
      return res.send(modifiedContent);
    }
    
    return res.send(content);

  } catch (error) {
    console.error('Proxy Error:', error);
    const errorResponse = {
      error: 'Internal Server Error',
      message: error.message,
      url: req.query.url
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
    }
    
    res.status(500).json(errorResponse);
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
    externalResolver: true
  }
};