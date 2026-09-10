import test from "node:test";
import assert from "node:assert/strict";
import { canJoinChallenge, challengeIdFromSearch, headToHead, oppositeSide, profileSummary, ratingTable, resultForChallenge, roundResult, roundTradePreflight, roundTradeSummary, scoreRecords } from "../src/domain.js";

test("a creator wallet cannot accept its own challenge", () => {
  assert.equal(canJoinChallenge({ creatorAddress: "0xAbC" }, "0xabc"), false);
  assert.equal(canJoinChallenge({ creatorAddress: "0xAbC" }, "0xdef"), true);
});

test("a joined challenge cannot accept a duplicate participant", () => {
  assert.equal(canJoinChallenge({ creatorAddress: "0xcreator", challengerAddress: "0xother" }, "0xnew"), false);
});

test("only a compact challenge identifier is accepted from the URL", () => {
  assert.deepEqual(challengeIdFromSearch("?challenge=call-abc123"), { id: "call-abc123", issue: null });
  assert.match(challengeIdFromSearch("?challenge=<script>").issue, /malformed/i);
});

test("opposite sides stay binary", () => {
  assert.equal(oppositeSide("UP"), "DOWN");
  assert.equal(oppositeSide("DOWN"), "UP");
});

test("voids never fabricate a winner", () => {
  const result = resultForChallenge({ creatorSide: "UP", challengerSide: "DOWN" }, "Voided", "UP");
  assert.equal(result.status, "void");
  assert.equal(result.winner, null);
});

test("canonical winning outcome selects only the matching caller", () => {
  const duel = {
    creatorAddress: "0xcreator",
    creatorSide: "UP",
    challengerAddress: "0xchallenger",
    challengerSide: "DOWN",
  };
  const result = resultForChallenge(duel, "Resolved", "DOWN");
  assert.equal(result.status, "resolved");
  assert.equal(result.winner, "0xchallenger");
});

test("leaderboard scores each wallet only once per market", () => {
  const rows = scoreRecords([
    { marketId: "m1", creatorAddress: "0xa", challengerAddress: "0xb", winnerAddress: "0xa", resultStatus: "resolved" },
    { marketId: "m1", creatorAddress: "0xa", challengerAddress: "0xc", winnerAddress: "0xa", resultStatus: "resolved" },
  ]);
  assert.deepEqual(rows[0], { address: "0xa", score: 4, wins: 1, duels: 1 });
});

test("creator and challenger records retain independent order identifiers", () => {
  const record = { creatorOrderId: "41", challengerOrderId: "42" };
  assert.notEqual(record.creatorOrderId, record.challengerOrderId);
});

test("profile summary counts wins, losses, voids, and current streak without stake size", () => {
  const summary = profileSummary([
    { creatorAddress: "0xa", challengerAddress: "0xb", winnerAddress: "0xa", resultStatus: "resolved", createdAt: "2026-09-08T03:00:00Z" },
    { creatorAddress: "0xa", challengerAddress: "0xc", winnerAddress: "0xa", resultStatus: "resolved", createdAt: "2026-09-08T02:00:00Z" },
    { creatorAddress: "0xa", challengerAddress: "0xd", resultStatus: "void", createdAt: "2026-09-08T01:00:00Z" },
  ], "0xA");
  assert.deepEqual(summary, { wins: 2, losses: 0, voids: 1, settled: 2, streak: 2, streakType: "win" });
});

test("round PnL marks recorded buys and sells without reading unrelated wallet balance", () => {
  const round = {
    budget: 100,
    creatorAddress: "0xa",
    rivalAddress: "0xb",
    startedAt: "2026-09-09T00:00:00Z",
    endsAt: "2026-09-09T01:00:00Z",
    maxTrades: 5,
    trades: [
      { playerAddress: "0xa", marketId: "m1", outcome: "UP", action: "buy", filledQuantity: 10, filledNotional: 4 },
      { playerAddress: "0xa", marketId: "m1", outcome: "UP", action: "sell", filledQuantity: 2, filledNotional: 1.2 },
    ],
  };
  const summary = roundTradeSummary(round, "0xa", { "m1:UP": 0.5 });
  assert.equal(summary.cash, 97.2);
  assert.equal(summary.markedValue, 4);
  assert.equal(summary.pnl, 1.2);
});

test("an unavailable mark preserves open-position cost basis instead of inventing a total loss", () => {
  const round = {
    budget: 100,
    trades: [{ playerAddress: "0xa", marketId: "m1", outcome: "UP", action: "buy", filledQuantity: 20, filledNotional: 12 }],
  };
  const summary = roundTradeSummary(round, "0xa", {});
  assert.equal(summary.markedValue, 12);
  assert.equal(summary.pnl, 0);
  assert.equal(summary.unpricedPositions, 1);
});

test("round trade preflight caps buys and rejects inactive or outsider wallets", () => {
  const round = {
    budget: 5,
    creatorAddress: "0xa",
    rivalAddress: "0xb",
    startedAt: "2026-09-09T00:00:00Z",
    endsAt: "2026-09-09T01:00:00Z",
    trades: [{ playerAddress: "0xa", marketId: "m1", outcome: "UP", action: "buy", filledQuantity: 1, filledNotional: 4 }],
  };
  assert.equal(roundTradePreflight(round, "0xa", 2, new Date("2026-09-09T00:10:00Z")).ready, false);
  assert.equal(roundTradePreflight(round, "0xc", 0, new Date("2026-09-09T00:10:00Z")).ready, false);
});

test("closed round result compares a common mark only after both players trade", () => {
  const round = {
    creatorAddress: "0xa", rivalAddress: "0xb", budget: 100,
    trades: [
      { playerAddress: "0xa", marketId: "m", outcome: "UP", action: "buy", filledQuantity: 10, filledNotional: 4 },
      { playerAddress: "0xb", marketId: "m", outcome: "DOWN", action: "buy", filledQuantity: 10, filledNotional: 7 },
    ],
  };
  const result = roundResult(round, { "m:UP": 0.6, "m:DOWN": 0.4 });
  assert.equal(result.eligible, true);
  assert.equal(result.winnerAddress, "0xa");
});

test("rating and head-to-head history use only eligible closed rounds", () => {
  const rounds = [
    { creatorAddress: "0xa", rivalAddress: "0xb", resultStatus: "resolved", winnerAddress: "0xa", closedAt: "2026-09-09T01:00:00Z" },
    { creatorAddress: "0xa", rivalAddress: "0xb", resultStatus: "draw", closedAt: "2026-09-09T02:00:00Z" },
  ];
  assert.equal(ratingTable(rounds)[0].rating, 1035);
  assert.deepEqual(headToHead(rounds, "0xa", "0xb"), { firstWins: 1, secondWins: 0, draws: 1, rounds: 2, latest: rounds[1] });
});

test("GG forfeit rewards the rival and applies a rating penalty to the conceder", () => {
  const round = {
    creatorAddress: "0xa", rivalAddress: "0xb", resultStatus: "forfeit",
    winnerAddress: "0xb", concededBy: "0xa", closedAt: "2026-09-09T03:00:00Z",
  };
  const table = ratingTable([round]);
  assert.equal(table.find((row) => row.address === "0xb").rating, 1025);
  assert.equal(table.find((row) => row.address === "0xa").rating, 990);
});
