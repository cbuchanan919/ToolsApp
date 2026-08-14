// 2026 federal tax reference data — single source of truth, consumed by
// GET /api/federal and POST /api/tax-estimate. Previously duplicated across
// tools/Finance/IncomeCalculatorSimple/app.js and
// tools/Finance/InvestmentGrowthCalculator/app.js.
'use strict';

module.exports = {
  "brackets": {
    "single": [
      [
        0,
        10
      ],
      [
        12400,
        12
      ],
      [
        50400,
        22
      ],
      [
        105700,
        24
      ],
      [
        201775,
        32
      ],
      [
        256225,
        35
      ],
      [
        640600,
        37
      ]
    ],
    "mfj": [
      [
        0,
        10
      ],
      [
        24800,
        12
      ],
      [
        100800,
        22
      ],
      [
        211400,
        24
      ],
      [
        403550,
        32
      ],
      [
        512450,
        35
      ],
      [
        768700,
        37
      ]
    ],
    "hoh": [
      [
        0,
        10
      ],
      [
        17700,
        12
      ],
      [
        67450,
        22
      ],
      [
        105700,
        24
      ],
      [
        201775,
        32
      ],
      [
        256200,
        35
      ],
      [
        640600,
        37
      ]
    ]
  },
  "stdDed": {
    "single": 16100,
    "mfj": 32200,
    "hoh": 24150
  },
  "seniorDed": {
    "single": 2050,
    "mfj": 1650,
    "hoh": 2050
  },
  "fica": {
    "ssRate": 0.062,
    "medicareRate": 0.0145,
    "addlMedicareRate": 0.009,
    "addlMedicareThreshold": {
      "single": 200000,
      "hoh": 200000,
      "mfj": 250000
    }
  }
};
