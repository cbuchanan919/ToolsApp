'use strict';

const express = require('express');
const FEDERAL = require('../data/federal');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(FEDERAL);
});

module.exports = router;
