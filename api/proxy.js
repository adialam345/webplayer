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

    // Debug original URL
    console.log('Original encoded URL:', encodedUrl);

    // Safely decode URL - handle YouTube's special encoding
    let targetUrl;
    try {
      // First try single decode
      targetUrl = decodeURIComponent(encodedUrl);
      console.log('After first decode:', targetUrl);

      // For YouTube URLs, we need to handle their special encoding
      if (targetUrl.includes('googlevideo.com')) {
        // Handle YouTube's special encoding cases
        targetUrl = targetUrl
          // First handle triple-encoded slashes and other chars
          .replace(/(%25252F)/g, '/')
          .replace(/(%25253D)/g, '=')
          .replace(/(%25253F)/g, '?')
          .replace(/(%252526)/g, '&')
          // Then handle double-encoded chars
          .replace(/(%252F)/g, '/')
          .replace(/(%253D)/g, '=')
          .replace(/(%253F)/g, '?')
          .replace(/(%2526)/g, '&')
          // Finally handle single-encoded chars
          .replace(/(%2F)/g, '/')
          .replace(/(%3D)/g, '=')
          .replace(/(%3F)/g, '?')
          .replace(/(%26)/g, '&');

        console.log('After YouTube URL processing:', targetUrl);
      }
    } catch (e) {
      console.error('URL decode error:', e);
      return res.status(400).json({ 
        error: 'Invalid URL encoding', 
        details: e.message,
        originalUrl: encodedUrl 
      });
    }

    // Prevent proxy loops
    if (targetUrl.includes('/api/proxy')) {
      return res.status(400).json({ error: 'Proxy loop detected' });
    }

    console.log('Final URL to fetch:', targetUrl);

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
      timeout: 15000 // 15 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText} - ${await response.text()}`);
    }

    const content = await response.text();
    console.log('Response content type:', response.headers.get('content-type'));
    console.log('Content preview:', content.substring(0, 200));
    
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
    if (contentType.includes('mpegurl') || targetUrl.endsWith('.m3u8')) {
      const modifiedContent = content.replace(
        /(https?:\/\/[^"\n\s]+)/g,
        (match) => {
          // Skip if already proxied
          if (match.includes('/api/proxy')) return match;
          // Ensure proper encoding for YouTube URLs
          const encodedMatch = encodeURIComponent(match);
          console.log('Rewriting URL:', match, 'to:', `/api/proxy?url=${encodedMatch}`);
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
      url: req.query.url,
      decodedUrl: targetUrl
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