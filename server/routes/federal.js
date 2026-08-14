'use strict';

const express = require('express');
const FEDERAL = require('../data/federal');

const router = express.Router();

// Federal brackets/deductions/FICA constants — consumed once on page load
// by both Finance tools.
router.get('/', (req, res) => {
  res.json(FEDERAL);
});

module.exports = router;
