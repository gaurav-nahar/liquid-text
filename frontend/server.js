const https = require("https");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 8000;
const HOST = "0.0.0.0";

// SSL configuration
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "ssl", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "ssl", "cert.pem")),
};

// Serve static files
app.use(express.static(path.join(__dirname, "build")));

// SPA fallback (NO wildcard route)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// Start HTTPS server
https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
  console.log("🚀 HTTPS server running at:");
  console.log(`👉 https://${HOST}:${PORT}`);
});
