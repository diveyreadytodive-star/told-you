import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const dataDirectory = fileURLToPath(new URL("./data/", import.meta.url));
const dataFile = join(dataDirectory, "duels.json");
const roundsFile = join(dataDirectory, "rounds.json");
const port = Number(process.env.PORT || 4173);

mkdirSync(dataDirectory, { recursive: true });
if (!existsSync(dataFile)) writeFileSync(dataFile, "[]\n");
if (!existsSync(roundsFile)) writeFileSync(roundsFile, "[]\n");

function readDuels() {
  try {
    const data = JSON.parse(readFileSync(dataFile, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function persistDuels(records) {
  writeFileSync(dataFile, `${JSON.stringify(records, null, 2)}\n`);
}

function readRounds() {
  try {
    const data = JSON.parse(readFileSync(roundsFile, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function persistRounds(records) {
  writeFileSync(roundsFile, JSON.stringify(records, null, 2) + "\n");
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function safeRecord(input) {
  const fields = [
    "id", "marketId", "creatorAddress", "creatorSide", "quantity", "maxPrice", "creatorTxHash", "creatorOrderId",
    "creatorOrderStatus", "createdAt", "challengerAddress", "challengerSide", "challengerTxHash", "challengerOrderId",
    "challengerOrderStatus", "lastNoFillTxHash", "lastNoFillOrderId", "lastNoFillAt", "resultStatus", "winnerAddress", "marketStatus",
  ];
  return Object.fromEntries(fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

function safeRound(input) {
  const fields = [
    "id", "createdAt", "expiresAt", "startedAt", "endsAt", "closedAt", "creatorAddress", "rivalAddress",
    "budget", "status", "creatorReady", "rivalReady", "creatorStartBalance", "rivalStartBalance", "trades",
    "closedAt", "resultStatus", "winnerAddress", "concededBy", "finalMarks", "finalScores", "lastMarks",
  ];
  return Object.fromEntries(fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/duels" && request.method === "GET") return json(response, 200, readDuels());
  if (url.pathname === "/api/duels" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const record = safeRecord(JSON.parse(body));
        if (!record.id || !record.marketId || !record.creatorAddress || !record.creatorSide) return json(response, 400, { error: "Missing required public duel fields." });
        const records = readDuels();
        const index = records.findIndex((item) => item.id === record.id);
        if (index >= 0) records[index] = { ...records[index], ...record };
        else records.unshift(record);
        persistDuels(records);
        return json(response, 200, records.find((item) => item.id === record.id));
      } catch {
        return json(response, 400, { error: "Invalid JSON." });
      }
    });
    return;
  }
  if (url.pathname === "/api/rounds" && request.method === "GET") return json(response, 200, readRounds());
  if (url.pathname === "/api/rounds" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const round = safeRound(JSON.parse(body));
        if (!round.id || !round.creatorAddress || !round.createdAt) {
          return json(response, 400, { error: "Missing required public round fields." });
        }
        if (round.trades && !Array.isArray(round.trades)) return json(response, 400, { error: "Round trades must be an array." });
        const rounds = readRounds();
        const index = rounds.findIndex((item) => item.id === round.id);
        if (index >= 0) rounds[index] = { ...rounds[index], ...round };
        else rounds.unshift(round);
        persistRounds(rounds);
        return json(response, 200, rounds.find((item) => item.id === round.id));
      } catch {
        return json(response, 400, { error: "Invalid JSON." });
      }
    });
    return;
  }

  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = join(root, normalize(requested));
  const resolved = existsSync(filePath) ? filePath : join(root, "index.html");
  response.writeHead(200, { "content-type": mime[extname(resolved)] || "application/octet-stream" });
  createReadStream(resolved).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Call It is running on http://127.0.0.1:${port}`);
});
