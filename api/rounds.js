import { Redis } from "@upstash/redis";

const ROUND_INDEX = "told-you:rounds";
const keyFor = (id) => `told-you:round:${id}`;
const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));

function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function safeRound(input = {}) {
  const fields = [
    "id", "createdAt", "expiresAt", "startedAt", "endsAt", "closedAt", "creatorAddress", "rivalAddress",
    "budget", "status", "creatorReady", "rivalReady", "creatorStartBalance", "rivalStartBalance",
    "trades", "resultStatus", "winnerAddress", "concededBy", "finalMarks", "finalScores", "lastMarks",
  ];
  return Object.fromEntries(fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

export default async function handler(request, response) {
  const store = redis();
  if (!store) return response.status(503).json({ error: "Public round storage is not configured." });

  try {
    if (request.method === "GET") {
      const ids = await store.zrange(ROUND_INDEX, 0, 99, { rev: true });
      const rounds = await Promise.all(ids.map((id) => store.get(keyFor(id))));
      return response.status(200).json(rounds.filter(Boolean));
    }

    if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
    const round = safeRound(request.body);
    if (!round.id || !round.creatorAddress || !round.createdAt) {
      return response.status(400).json({ error: "Missing required public round fields." });
    }
    if (round.trades && !Array.isArray(round.trades)) return response.status(400).json({ error: "Round trades must be an array." });

    if (!/^round-[a-z0-9-]{6,64}$/i.test(round.id) || !isAddress(round.creatorAddress)) {
      return response.status(400).json({ error: "Invalid public round identifier or creator address." });
    }
    if (round.rivalAddress && (!isAddress(round.rivalAddress) || round.rivalAddress.toLowerCase() === round.creatorAddress.toLowerCase())) {
      return response.status(400).json({ error: "A rival must be a different valid wallet address." });
    }

    const existing = await store.get(keyFor(round.id));
    if (existing) {
      if (existing.creatorAddress.toLowerCase() !== round.creatorAddress.toLowerCase()) {
        return response.status(409).json({ error: "Round creator cannot be changed." });
      }
      if (existing.closedAt || existing.resultStatus) return response.status(409).json({ error: "This round is already closed." });
      if (existing.rivalAddress && round.rivalAddress && existing.rivalAddress.toLowerCase() !== round.rivalAddress.toLowerCase()) {
        return response.status(409).json({ error: "This public duel already has a rival." });
      }
      if (existing.startedAt && round.rivalAddress && existing.rivalAddress?.toLowerCase() !== round.rivalAddress.toLowerCase()) {
        return response.status(409).json({ error: "A live round cannot accept another rival." });
      }
    }
    const next = { ...(existing || {}), ...round };
    await store.set(keyFor(round.id), next, { ex: 60 * 60 * 24 * 7 });
    await store.zadd(ROUND_INDEX, { score: Date.parse(next.createdAt) || Date.now(), member: next.id });
    return response.status(200).json(next);
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : "Round storage failed." });
  }
}
