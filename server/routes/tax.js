'use strict';

const express = require('express');
const { estimateTax } = require('../lib/taxCalc');

const router = express.Router();

router.post('/', (req, res) => {
  const body = req.body || {};

  if (typeof body.income !== 'number' || !isFinite(body.income) || body.income < 0) {
    return res.status(400).json({ error: '"income" must be a non-negative number.' });
  }
  if (body.filingStatus !== undefined && !['single', 'mfj', 'hoh'].includes(body.filingStatus)) {
    return res.status(400).json({ error: '"filingStatus" must be "single", "mfj", or "hoh".' });
  }

  res.json(estimateTax(body));
});

module.exports = router;
