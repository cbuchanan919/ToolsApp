'use strict';

const express = require('express');
const STATES = require('../data/states');

const router = express.Router();

// Full dataset (name, cost-of-living index, tax brackets, standard
// deduction) — consumed once on page load by both Finance tools, which then
// compute locally from it. Nothing here is sensitive, so no auth needed.
router.get('/', (req, res) => {
  res.json(STATES);
});

module.exports = router;
