// 2026 state tax reference data + cost-of-living index (100 = national
// average, MERIC/C2ER 2025 annual average via
// https://worldpopulationreview.com/state-rankings/cost-of-living-index-by-state).
// Single source of truth for GET /api/states and POST /api/tax-estimate.
// Previously duplicated across tools/Finance/IncomeCalculatorSimple/app.js
// and tools/Finance/InvestmentGrowthCalculator/app.js.
'use strict';

module.exports = {
  "AL": {
    "name": "Alabama",
    "col": 88.6,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2
        ],
        [
          500,
          4
        ],
        [
          3000,
          5
        ]
      ],
      "mfj": [
        [
          0,
          2
        ],
        [
          1000,
          4
        ],
        [
          6000,
          5
        ]
      ]
    },
    "stdDed": {
      "single": 3000,
      "mfj": 8500
    }
  },
  "AK": {
    "name": "Alaska",
    "col": 124.9,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "AZ": {
    "name": "Arizona",
    "col": 110.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2.5
        ]
      ],
      "mfj": [
        [
          0,
          2.5
        ]
      ]
    },
    "stdDed": {
      "single": 8350,
      "mfj": 16700
    }
  },
  "AR": {
    "name": "Arkansas",
    "col": 89.6,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2
        ],
        [
          4600,
          3.9
        ]
      ],
      "mfj": [
        [
          0,
          2
        ],
        [
          4600,
          3.9
        ]
      ]
    },
    "stdDed": {
      "single": 2470,
      "mfj": 4940
    }
  },
  "CA": {
    "name": "California",
    "col": 142.3,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          1
        ],
        [
          11079,
          2
        ],
        [
          26264,
          4
        ],
        [
          41452,
          6
        ],
        [
          57542,
          8
        ],
        [
          72724,
          9.3
        ],
        [
          371479,
          10.3
        ],
        [
          445771,
          11.3
        ],
        [
          742953,
          12.3
        ],
        [
          1000000,
          13.3
        ]
      ],
      "mfj": [
        [
          0,
          1
        ],
        [
          22158,
          2
        ],
        [
          52528,
          4
        ],
        [
          82904,
          6
        ],
        [
          115084,
          8
        ],
        [
          145448,
          9.3
        ],
        [
          742958,
          10.3
        ],
        [
          891542,
          11.3
        ],
        [
          1000000,
          12.3
        ],
        [
          1485906,
          13.3
        ]
      ]
    },
    "stdDed": {
      "single": 5540,
      "mfj": 11080
    }
  },
  "CO": {
    "name": "Colorado",
    "col": 102.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          4.4
        ]
      ],
      "mfj": [
        [
          0,
          4.4
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  },
  "CT": {
    "name": "Connecticut",
    "col": 112.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2
        ],
        [
          10000,
          4.5
        ],
        [
          50000,
          5.5
        ],
        [
          100000,
          6
        ],
        [
          200000,
          6.5
        ],
        [
          250000,
          6.9
        ],
        [
          500000,
          6.99
        ]
      ],
      "mfj": [
        [
          0,
          2
        ],
        [
          20000,
          4.5
        ],
        [
          100000,
          5.5
        ],
        [
          200000,
          6
        ],
        [
          400000,
          6.5
        ],
        [
          500000,
          6.9
        ],
        [
          1000000,
          6.99
        ]
      ]
    },
    "stdDed": {
      "single": 15000,
      "mfj": 24000
    }
  },
  "DE": {
    "name": "Delaware",
    "col": 101.9,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          2000,
          2.2
        ],
        [
          5000,
          3.9
        ],
        [
          10000,
          4.8
        ],
        [
          20000,
          5.2
        ],
        [
          25000,
          5.55
        ],
        [
          60000,
          6.6
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          2000,
          2.2
        ],
        [
          5000,
          3.9
        ],
        [
          10000,
          4.8
        ],
        [
          20000,
          5.2
        ],
        [
          25000,
          5.55
        ],
        [
          60000,
          6.6
        ]
      ]
    },
    "stdDed": {
      "single": 3250,
      "mfj": 6500
    }
  },
  "FL": {
    "name": "Florida",
    "col": 102.2,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "GA": {
    "name": "Georgia",
    "col": 92.5,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          5.19
        ]
      ],
      "mfj": [
        [
          0,
          5.19
        ]
      ]
    },
    "stdDed": {
      "single": 12000,
      "mfj": 24000
    }
  },
  "HI": {
    "name": "Hawaii",
    "col": 185,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          1.4
        ],
        [
          9600,
          3.2
        ],
        [
          14400,
          5.5
        ],
        [
          19200,
          6.4
        ],
        [
          24000,
          6.8
        ],
        [
          36000,
          7.2
        ],
        [
          48000,
          7.6
        ],
        [
          125000,
          7.9
        ],
        [
          175000,
          8.25
        ],
        [
          225000,
          9
        ],
        [
          275000,
          10
        ],
        [
          325000,
          11
        ]
      ],
      "mfj": [
        [
          0,
          1.4
        ],
        [
          19200,
          3.2
        ],
        [
          28800,
          5.5
        ],
        [
          38400,
          6.4
        ],
        [
          48000,
          6.8
        ],
        [
          72000,
          7.2
        ],
        [
          96000,
          7.6
        ],
        [
          250000,
          7.9
        ],
        [
          350000,
          8.25
        ],
        [
          450000,
          9
        ],
        [
          550000,
          10
        ],
        [
          650000,
          11
        ]
      ]
    },
    "stdDed": {
      "single": 4400,
      "mfj": 8800
    }
  },
  "ID": {
    "name": "Idaho",
    "col": 99.9,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          4811,
          5.3
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          9622,
          5.3
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  },
  "IL": {
    "name": "Illinois",
    "col": 94.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          4.95
        ]
      ],
      "mfj": [
        [
          0,
          4.95
        ]
      ]
    },
    "stdDed": {
      "single": 2925,
      "mfj": 5850
    }
  },
  "IN": {
    "name": "Indiana",
    "col": 91,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2.95
        ]
      ],
      "mfj": [
        [
          0,
          2.95
        ]
      ]
    },
    "stdDed": {
      "single": 1000,
      "mfj": 2000
    }
  },
  "IA": {
    "name": "Iowa",
    "col": 89.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.8
        ]
      ],
      "mfj": [
        [
          0,
          3.8
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  },
  "KS": {
    "name": "Kansas",
    "col": 88.8,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          5.2
        ],
        [
          23000,
          5.58
        ]
      ],
      "mfj": [
        [
          0,
          5.2
        ],
        [
          46000,
          5.58
        ]
      ]
    },
    "stdDed": {
      "single": 3605,
      "mfj": 8240
    }
  },
  "KY": {
    "name": "Kentucky",
    "col": 92.5,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.5
        ]
      ],
      "mfj": [
        [
          0,
          3.5
        ]
      ]
    },
    "stdDed": {
      "single": 3360,
      "mfj": 3360
    }
  },
  "LA": {
    "name": "Louisiana",
    "col": 92.3,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3
        ]
      ],
      "mfj": [
        [
          0,
          3
        ]
      ]
    },
    "stdDed": {
      "single": 12875,
      "mfj": 25750
    }
  },
  "ME": {
    "name": "Maine",
    "col": 113,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          5.8
        ],
        [
          27399,
          6.75
        ],
        [
          64849,
          7.15
        ]
      ],
      "mfj": [
        [
          0,
          5.8
        ],
        [
          54849,
          6.75
        ],
        [
          129749,
          7.15
        ]
      ]
    },
    "stdDed": {
      "single": 8350,
      "mfj": 16700
    }
  },
  "MD": {
    "name": "Maryland",
    "col": 115.4,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2
        ],
        [
          1000,
          3
        ],
        [
          2000,
          4
        ],
        [
          3000,
          4.75
        ],
        [
          100000,
          5
        ],
        [
          125000,
          5.25
        ],
        [
          150000,
          5.5
        ],
        [
          250000,
          5.75
        ],
        [
          500000,
          6.25
        ],
        [
          1000000,
          6.5
        ]
      ],
      "mfj": [
        [
          0,
          2
        ],
        [
          1000,
          3
        ],
        [
          2000,
          4
        ],
        [
          3000,
          4.75
        ],
        [
          150000,
          5
        ],
        [
          175000,
          5.25
        ],
        [
          225000,
          5.5
        ],
        [
          300000,
          5.75
        ],
        [
          600000,
          6.25
        ],
        [
          1200000,
          6.5
        ]
      ]
    },
    "stdDed": {
      "single": 3350,
      "mfj": 6700
    }
  },
  "MA": {
    "name": "Massachusetts",
    "col": 141.2,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          5
        ],
        [
          1083150,
          9
        ]
      ],
      "mfj": [
        [
          0,
          5
        ],
        [
          1083150,
          9
        ]
      ]
    },
    "stdDed": {
      "single": 4400,
      "mfj": 8800
    }
  },
  "MI": {
    "name": "Michigan",
    "col": 90.1,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          4.25
        ]
      ],
      "mfj": [
        [
          0,
          4.25
        ]
      ]
    },
    "stdDed": {
      "single": 5900,
      "mfj": 11800
    }
  },
  "MN": {
    "name": "Minnesota",
    "col": 94.6,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          5.35
        ],
        [
          33310,
          6.8
        ],
        [
          109430,
          7.85
        ],
        [
          203150,
          9.85
        ]
      ],
      "mfj": [
        [
          0,
          5.35
        ],
        [
          48700,
          6.8
        ],
        [
          193480,
          7.85
        ],
        [
          337930,
          9.85
        ]
      ]
    },
    "stdDed": {
      "single": 15300,
      "mfj": 30600
    }
  },
  "MS": {
    "name": "Mississippi",
    "col": 87.3,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          10000,
          4
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          10000,
          4
        ]
      ]
    },
    "stdDed": {
      "single": 2300,
      "mfj": 4600
    }
  },
  "MO": {
    "name": "Missouri",
    "col": 89,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          1348,
          2
        ],
        [
          2696,
          2.5
        ],
        [
          4044,
          3
        ],
        [
          5392,
          3.5
        ],
        [
          6740,
          4
        ],
        [
          8088,
          4.5
        ],
        [
          9436,
          4.7
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          1348,
          2
        ],
        [
          2696,
          2.5
        ],
        [
          4044,
          3
        ],
        [
          5392,
          3.5
        ],
        [
          6740,
          4
        ],
        [
          8088,
          4.5
        ],
        [
          9436,
          4.7
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  },
  "MT": {
    "name": "Montana",
    "col": 95.5,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          4.7
        ],
        [
          47500,
          5.65
        ]
      ],
      "mfj": [
        [
          0,
          4.7
        ],
        [
          95000,
          5.65
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  },
  "NE": {
    "name": "Nebraska",
    "col": 92.6,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2.46
        ],
        [
          4130,
          3.51
        ],
        [
          24760,
          4.55
        ]
      ],
      "mfj": [
        [
          0,
          2.46
        ],
        [
          8250,
          3.51
        ],
        [
          49530,
          4.55
        ]
      ]
    },
    "stdDed": {
      "single": 8850,
      "mfj": 17700
    }
  },
  "NV": {
    "name": "Nevada",
    "col": 100.2,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "NH": {
    "name": "New Hampshire",
    "col": 111.4,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "NJ": {
    "name": "New Jersey",
    "col": 115.1,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          1.4
        ],
        [
          20000,
          1.75
        ],
        [
          35000,
          3.5
        ],
        [
          40000,
          5.53
        ],
        [
          75000,
          6.37
        ],
        [
          500000,
          8.97
        ],
        [
          1000000,
          10.75
        ]
      ],
      "mfj": [
        [
          0,
          1.4
        ],
        [
          20000,
          1.75
        ],
        [
          50000,
          2.45
        ],
        [
          70000,
          3.5
        ],
        [
          80000,
          5.53
        ],
        [
          150000,
          6.37
        ],
        [
          500000,
          8.97
        ],
        [
          1000000,
          10.75
        ]
      ]
    },
    "stdDed": {
      "single": 1000,
      "mfj": 2000
    }
  },
  "NM": {
    "name": "New Mexico",
    "col": 93.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          1.5
        ],
        [
          5500,
          3.2
        ],
        [
          16500,
          4.3
        ],
        [
          33500,
          4.7
        ],
        [
          66500,
          4.9
        ],
        [
          210000,
          5.9
        ]
      ],
      "mfj": [
        [
          0,
          1.5
        ],
        [
          8000,
          3.2
        ],
        [
          25000,
          4.3
        ],
        [
          50000,
          4.7
        ],
        [
          100000,
          4.9
        ],
        [
          315000,
          5.9
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  },
  "NY": {
    "name": "New York",
    "col": 125.1,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.9
        ],
        [
          8500,
          4.4
        ],
        [
          11700,
          5.15
        ],
        [
          13900,
          5.4
        ],
        [
          80650,
          5.9
        ],
        [
          215400,
          6.85
        ],
        [
          1077550,
          9.65
        ],
        [
          5000000,
          10.3
        ],
        [
          25000000,
          10.9
        ]
      ],
      "mfj": [
        [
          0,
          3.9
        ],
        [
          17150,
          4.4
        ],
        [
          23600,
          5.15
        ],
        [
          27900,
          5.4
        ],
        [
          161550,
          5.9
        ],
        [
          323200,
          6.85
        ],
        [
          2155350,
          9.65
        ],
        [
          5000000,
          10.3
        ],
        [
          25000000,
          10.9
        ]
      ]
    },
    "stdDed": {
      "single": 8000,
      "mfj": 16050
    }
  },
  "NC": {
    "name": "North Carolina",
    "col": 97.8,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.99
        ]
      ],
      "mfj": [
        [
          0,
          3.99
        ]
      ]
    },
    "stdDed": {
      "single": 12750,
      "mfj": 25500
    }
  },
  "ND": {
    "name": "North Dakota",
    "col": 91.4,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          48475,
          1.95
        ],
        [
          244825,
          2.5
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          80975,
          1.95
        ],
        [
          298075,
          2.5
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  },
  "OH": {
    "name": "Ohio",
    "col": 94.3,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          26050,
          2.75
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          26050,
          2.75
        ]
      ]
    },
    "stdDed": {
      "single": 2400,
      "mfj": 4800
    }
  },
  "OK": {
    "name": "Oklahoma",
    "col": 86,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          3750,
          2.5
        ],
        [
          4900,
          3.5
        ],
        [
          7200,
          4.5
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          7500,
          2.5
        ],
        [
          9800,
          3.5
        ],
        [
          14400,
          4.5
        ]
      ]
    },
    "stdDed": {
      "single": 6350,
      "mfj": 12700
    }
  },
  "OR": {
    "name": "Oregon",
    "col": 111.8,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          4.75
        ],
        [
          4550,
          6.75
        ],
        [
          11400,
          8.75
        ],
        [
          125000,
          9.9
        ]
      ],
      "mfj": [
        [
          0,
          4.75
        ],
        [
          9100,
          6.75
        ],
        [
          22800,
          8.75
        ],
        [
          250000,
          9.9
        ]
      ]
    },
    "stdDed": {
      "single": 2910,
      "mfj": 5820
    }
  },
  "PA": {
    "name": "Pennsylvania",
    "col": 97.2,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.07
        ]
      ],
      "mfj": [
        [
          0,
          3.07
        ]
      ]
    },
    "stdDed": {
      "single": 0,
      "mfj": 0
    }
  },
  "RI": {
    "name": "Rhode Island",
    "col": 110.6,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.75
        ],
        [
          82050,
          4.75
        ],
        [
          186450,
          5.99
        ]
      ],
      "mfj": [
        [
          0,
          3.75
        ],
        [
          82050,
          4.75
        ],
        [
          186450,
          5.99
        ]
      ]
    },
    "stdDed": {
      "single": 11200,
      "mfj": 22400
    }
  },
  "SC": {
    "name": "South Carolina",
    "col": 94.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          0
        ],
        [
          3640,
          3
        ],
        [
          18230,
          6
        ]
      ],
      "mfj": [
        [
          0,
          0
        ],
        [
          3640,
          3
        ],
        [
          18230,
          6
        ]
      ]
    },
    "stdDed": {
      "single": 8350,
      "mfj": 16700
    }
  },
  "SD": {
    "name": "South Dakota",
    "col": 91.9,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "TN": {
    "name": "Tennessee",
    "col": 90.3,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "TX": {
    "name": "Texas",
    "col": 92.1,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "UT": {
    "name": "Utah",
    "col": 102.2,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          4.5
        ]
      ],
      "mfj": [
        [
          0,
          4.5
        ]
      ]
    },
    "stdDed": {
      "single": 0,
      "mfj": 0
    }
  },
  "VT": {
    "name": "Vermont",
    "col": 113.6,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.35
        ],
        [
          49400,
          6.6
        ],
        [
          119700,
          7.6
        ],
        [
          249700,
          8.75
        ]
      ],
      "mfj": [
        [
          0,
          3.35
        ],
        [
          82500,
          6.6
        ],
        [
          199450,
          7.6
        ],
        [
          304000,
          8.75
        ]
      ]
    },
    "stdDed": {
      "single": 7650,
      "mfj": 15300
    }
  },
  "VA": {
    "name": "Virginia",
    "col": 100.8,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2
        ],
        [
          3000,
          3
        ],
        [
          5000,
          5
        ],
        [
          17000,
          5.75
        ]
      ],
      "mfj": [
        [
          0,
          2
        ],
        [
          3000,
          3
        ],
        [
          5000,
          5
        ],
        [
          17000,
          5.75
        ]
      ]
    },
    "stdDed": {
      "single": 8750,
      "mfj": 17500
    }
  },
  "WA": {
    "name": "Washington (wages untaxed; capital gains only)",
    "col": 114.1,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "WV": {
    "name": "West Virginia",
    "col": 88.3,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          2.22
        ],
        [
          10000,
          2.96
        ],
        [
          25000,
          3.33
        ],
        [
          40000,
          4.44
        ],
        [
          60000,
          4.82
        ]
      ],
      "mfj": [
        [
          0,
          2.22
        ],
        [
          10000,
          2.96
        ],
        [
          25000,
          3.33
        ],
        [
          40000,
          4.44
        ],
        [
          60000,
          4.82
        ]
      ]
    },
    "stdDed": {
      "single": 2000,
      "mfj": 4000
    }
  },
  "WI": {
    "name": "Wisconsin",
    "col": 97.7,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          3.5
        ],
        [
          15110,
          4.4
        ],
        [
          51950,
          5.3
        ],
        [
          332720,
          7.65
        ]
      ],
      "mfj": [
        [
          0,
          3.5
        ],
        [
          20150,
          4.4
        ],
        [
          69260,
          5.3
        ],
        [
          443630,
          7.65
        ]
      ]
    },
    "stdDed": {
      "single": 13960,
      "mfj": 25840
    }
  },
  "WY": {
    "name": "Wyoming",
    "col": 93.7,
    "type": "none",
    "brackets": null,
    "stdDed": null
  },
  "DC": {
    "name": "Washington DC",
    "col": 138.8,
    "type": "brackets",
    "brackets": {
      "single": [
        [
          0,
          4
        ],
        [
          10000,
          6
        ],
        [
          40000,
          6.5
        ],
        [
          60000,
          8.5
        ],
        [
          250000,
          9.25
        ],
        [
          500000,
          9.75
        ],
        [
          1000000,
          10.75
        ]
      ],
      "mfj": [
        [
          0,
          4
        ],
        [
          10000,
          6
        ],
        [
          40000,
          6.5
        ],
        [
          60000,
          8.5
        ],
        [
          250000,
          9.25
        ],
        [
          500000,
          9.75
        ],
        [
          1000000,
          10.75
        ]
      ]
    },
    "stdDed": {
      "single": 16100,
      "mfj": 32200
    }
  }
};
