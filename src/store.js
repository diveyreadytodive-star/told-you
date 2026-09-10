import { challengeId, scoreRecords } from "./domain.js";

const LOCAL_KEY = "call-it-duels-v1";
const ROUND_LOCAL_KEY = "told-you-rounds-v1";

function localRecords() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocal(records) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
}

async function request(path, options) {
  if (typeof fetch !== "function") {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options?.method || "GET", path);
      Object.entries(options?.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`Record service returned ${xhr.status}.`));
        try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Record service returned invalid JSON.")); }
      };
      xhr.onerror = () => reject(new Error("Record service request failed."));
      xhr.send(options?.body);
    });
  }
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`Record service returned ${response.status}.`);
  return response.json();
}

export async function listDuels() {
  try {
    return await request("/api/duels");
  } catch {
    return localRecords();
  }
}

export async function saveDuel(input) {
  const record = {
    ...input,
    id: input.id || challengeId(input),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  try {
    return await request("/api/duels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  } catch {
    const records = localRecords();
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = { ...records[index], ...record };
    else records.unshift(record);
    saveLocal(records);
    return record;
  }
}

export async function leaderboard() {
  return scoreRecords(await listDuels());
}

function localRounds() {
  try {
    return JSON.parse(localStorage.getItem(ROUND_LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalRounds(rounds) {
  localStorage.setItem(ROUND_LOCAL_KEY, JSON.stringify(rounds));
}

export async function listRounds() {
  try {
    return await request("/api/rounds");
  } catch {
    return localRounds();
  }
}

export async function saveRound(input) {
  const round = {
    ...input,
    trades: input.trades || [],
    id: input.id || "round-" + crypto.randomUUID().slice(0, 12),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  try {
    return await request("/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(round),
    });
  } catch {
    const rounds = localRounds();
    const index = rounds.findIndex((item) => item.id === round.id);
    if (index >= 0) rounds[index] = { ...rounds[index], ...round };
    else rounds.unshift(round);
    saveLocalRounds(rounds);
    return round;
  }
}
