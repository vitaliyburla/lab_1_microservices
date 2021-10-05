const http = require("http");

const requestListener = (req, res) => {
  if (req.url === "/api/service_1") {
    res.writeHead(200);
    res.write("Hello from service 1!");
  }
  res.end();
};

const server = http.createServer(requestListener);
server.listen(8080);
