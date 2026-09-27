// 정적 파일 서버 — capture.html은 file://에서 동작하지 않으므로(동일 출처 정책)
// 검증 스크립트가 로컬 서버를 직접 띄운다. 외부 의존성 없음(node 내장 http만 사용).
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

function start(port) {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      let rel = decodeURIComponent(req.url.split("?")[0]);
      if (rel === "/") rel = "/index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
      fs.readFile(file, function (err, buf) {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(port || 0, "127.0.0.1", function () {
      resolve({ server: server, port: server.address().port });
    });
  });
}

module.exports = { start: start };

if (require.main === module) {
  start(parseInt(process.argv[2], 10) || 8080).then(function (s) {
    console.log("http://127.0.0.1:" + s.port + "/");
  });
}
