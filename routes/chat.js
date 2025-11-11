const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Chat routes are in server.js for simplicity' });
});

module.exports = router;