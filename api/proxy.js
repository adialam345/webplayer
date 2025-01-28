// api/proxy.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const encodedUrl = req.query.url;
    if (!encodedUrl) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }
    
    // Double decode URL to handle double encoding from client
    const targetUrl = decodeURIComponent(decodeURIComponent(encodedUrl));
    
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
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