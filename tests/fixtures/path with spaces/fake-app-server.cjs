const readline = require("node:readline");

if (process.argv[2] !== "app-server") process.exit(2);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  if (request.method === "initialize") {
    process.stdout.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
  } else if (request.method === "account/rateLimits/read") {
    process.stdout.write(`${JSON.stringify({ id: request.id, result: { rateLimits: { primary: { usedPercent: 1, windowDurationMins: 10080 } } } })}\n`);
  }
});
