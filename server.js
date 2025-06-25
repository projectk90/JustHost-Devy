const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

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

    res.set('Content-Type', 'text/html');
    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching or processing the video page.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
