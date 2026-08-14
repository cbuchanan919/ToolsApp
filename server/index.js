'use strict';

const app = require('./app');

// Positional CLI arg takes priority (matches the old `python serve.py 8080`
// convention), then $PORT (what the systemd unit sets), then a default.
const PORT = process.argv[2] || process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`ToolsApp running at http://localhost:${PORT}`);
});
