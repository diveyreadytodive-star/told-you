export const SCORE = {
  WIN: 3,
  PARTICIPATION: 1,
};

export const MIN_CHALLENGE_SECONDS = 300;
export const ROUND_BUDGET_TUSDC = 100;
export const ROUND_DURATION_SECONDS = 5 * 60;
export const RATING = {
  START: 1000,
  WIN: 25,
  DRAW: 10,
  LOSS: 5,
  FORFEIT_LOSS: -10,
};

export function normalizeAddress(address = "") {
  return String(address).trim().toLowerCase();
}

export function isWalletAddress(address = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address));
}

export function challengeIdFromSearch(search = "") {
  const id = new URLSearchParams(search).get("challenge");
  if (!id) return { id: null, issue: null };
  if (!/^call-[a-z0-9]{1,16}$/i.test(id)) {
    return { id: null, issue: "This challenge link is malformed. Ask the creator to copy a fresh link." };
  }
  return { id, issue: null };
}

export function challengeId({ marketId, creator, creatorAddress, createdAt }) {
  const source = `${marketId}:${normalizeAddress(creatorAddress || creator)}:${createdAt}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `call-${(hash >>> 0).toString(36)}`;
}

export function canJoinChallenge(challenge, walletAddress) {
  const creator = normalizeAddress(challenge.creatorAddress);
  const challenger = normalizeAddress(walletAddress);
  return Boolean(challenger) && creator !== challenger && !normalizeAddress(challenge.challengerAddress);
}

export function oppositeSide(side) {
  return side === "UP" ? "DOWN" : "UP";
}

export function marketIsTradable(market) {
  return market?.status === "Trading" && Number(market.secondsLeft) >= MIN_CHALLENGE_SECONDS;
}

export function callPreflight({ market, quantity, maxPrice, balances }) {
  const issues = [];
  const contracts = Number(quantity);
  const price = Number(maxPrice);
  const cost = contracts * price;
  if (!marketIsTradable(market)) issues.push("Choose a Trading market with at least five minutes remaining.");
  if (!Number.isInteger(contracts) || contracts < 1) issues.push("Choose at least one whole contract.");
  if (!Number.isFinite(price) || price <= 0 || price >= 1) issues.push("Set a maximum price between 0.01 and 0.99.");
  if (balances && Number(balances.stt) < 0.01) issues.push("You need STT for Shannon testnet gas.");
  if (balances && Number(balances.tUsdc) < cost) issues.push("You need more tUSDC than this call can cost.");
  return { cost, issues, ready: issues.length === 0 };
}

export function resultForChallenge(challenge, marketStatus, winningSide) {
  if (marketStatus === "Voided") {
    return { status: "void", winner: null, label: "Market voided — no Call It winner." };
  }
  if (marketStatus !== "Resolved" || !winningSide) {
    return { status: "pending", winner: null, label: "Waiting for canonical settlement." };
  }
  if (challenge.creatorSide === winningSide) {
    return {
      status: "resolved",
      winner: challenge.creatorAddress,
      label: "Creator called it.",
    };
  }
  if (challenge.challengerSide === winningSide) {
    return {
      status: "resolved",
      winner: challenge.challengerAddress,
      label: "Challenger called it.",
    };
  }
  return { status: "pending", winner: null, label: "No verified opposing call yet." };
}

export function profileSummary(records = [], walletAddress = "") {
  const wallet = normalizeAddress(walletAddress);
  const mine = records
    .filter((record) => [record.creatorAddress, record.challengerAddress].map(normalizeAddress).includes(wallet))
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const settled = mine.filter((record) => record.resultStatus === "resolved");
  const wins = settled.filter((record) => normalizeAddress(record.winnerAddress) === wallet).length;
  const losses = settled.length - wins;
  const voids = mine.filter((record) => record.resultStatus === "void").length;
  const latestResults = settled.map((record) => normalizeAddress(record.winnerAddress) === wallet ? "win" : "loss");
  const streakType = latestResults[0] || null;
  const streak = streakType ? latestResults.findIndex((result) => result !== streakType) : -1;
  return {
    wins,
    losses,
    voids,
    settled: settled.length,
    streak: streakType ? Math.max(1, streak === -1 ? latestResults.length : streak) : 0,
    streakType,
  };
}

export function scoreRecords(records = []) {
  const perWalletMarket = new Set();
  const scores = new Map();

  for (const record of records) {
    if (record.resultStatus !== "resolved") continue;
    const participants = [record.creatorAddress, record.challengerAddress].filter(Boolean);
    for (const address of participants) {
      const normalized = normalizeAddress(address);
      const key = `${normalized}:${record.marketId}`;
      if (!normalized || perWalletMarket.has(key)) continue;
      perWalletMarket.add(key);
      const current = scores.get(normalized) || { address: normalized, score: 0, wins: 0, duels: 0 };
      current.duels += 1;
      current.score += SCORE.PARTICIPATION;
      if (normalizeAddress(record.winnerAddress) === normalized) {
        current.wins += 1;
        current.score += SCORE.WIN;
      }
      scores.set(normalized, current);
    }
  }

  return [...scores.values()].sort(
    (left, right) => right.score - left.score || right.wins - left.wins || left.address.localeCompare(right.address),
  );
}

export function shortAddress(address = "") {
  if (!address || address.length < 10) return address || "Unknown";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatCountdown(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function roundPlayer(round, address) {
  const normalized = normalizeAddress(address);
  if (normalized === normalizeAddress(round.creatorAddress)) return "creator";
  if (normalized === normalizeAddress(round.rivalAddress)) return "rival";
  return null;
}

export function roundStatus(round, now = Date.now()) {
  if (!round?.rivalAddress) return "waiting";
  if (!round.startedAt) return "waiting";
  if (round.closedAt) return "closed";
  return Number(new Date(round.endsAt)) > now ? "live" : "marking";
}

export function canJoinOpenRound(round, walletAddress, now = Date.now()) {
  if (!round?.creatorAddress || !isWalletAddress(walletAddress)) return false;
  if (normalizeAddress(round.creatorAddress) === normalizeAddress(walletAddress)) return false;
  if (round.rivalAddress || round.startedAt || round.closedAt || round.resultStatus) return false;
  if (round.expiresAt && Number(new Date(round.expiresAt)) <= now) return false;
  return true;
}

export function openRounds(rounds = [], now = Date.now()) {
  return rounds
    .filter((round) => round?.creatorAddress && !round.rivalAddress && !round.startedAt && !round.closedAt && !round.resultStatus)
    .filter((round) => !round.expiresAt || Number(new Date(round.expiresAt)) > now)
    .sort((left, right) => Number(new Date(right.createdAt)) - Number(new Date(left.createdAt)));
}

export function roundTradeSummary(round, address, marks = {}) {
  const owner = normalizeAddress(address);
  const trades = (round?.trades || []).filter((trade) => normalizeAddress(trade.playerAddress) === owner);
  let cash = Number(round?.budget || ROUND_BUDGET_TUSDC);
  const positions = new Map();
  const costBasis = new Map();
  let buyNotional = 0;

  for (const trade of trades) {
    const quantity = Number(trade.filledQuantity || 0);
    const notional = Number(trade.filledNotional || 0);
    const key = `${trade.marketId}:${trade.outcome}`;
    const current = positions.get(key) || 0;
    const currentCost = costBasis.get(key) || 0;
    if (trade.action === "sell") {
      cash += notional;
      // Preserve the cost basis of any remaining shares. This matters when a
      // trader partially exits before the shared round mark is refreshed.
      costBasis.set(key, Math.max(0, currentCost - currentCost * (Math.min(quantity, current) / Math.max(current, 1))));
    } else {
      cash -= notional;
      buyNotional += notional;
      costBasis.set(key, currentCost + notional);
    }
    positions.set(key, current + (trade.action === "sell" ? -quantity : quantity));
  }

  let markedValue = 0;
  let unpricedPositions = 0;
  for (const [key, quantity] of positions) {
    const openQuantity = Math.max(0, quantity);
    if (!openQuantity) continue;
    const mark = marks[key];
    if (Number.isFinite(Number(mark))) markedValue += openQuantity * Number(mark);
    else {
      // Missing data is not a zero-priced settlement. Hold cost basis until a
      // verified live/settlement price arrives, so an API outage cannot invent a loss.
      markedValue += Number(costBasis.get(key) || 0);
      unpricedPositions += 1;
    }
  }
  const toRoundUnit = (value) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    cash: toRoundUnit(cash),
    buyNotional: toRoundUnit(buyNotional),
    tradeCount: trades.length,
    positions: [...positions.entries()].map(([key, quantity]) => ({ key, quantity })).filter((position) => position.quantity > 0),
    unpricedPositions,
    markedValue: toRoundUnit(markedValue),
    equity: toRoundUnit(cash + markedValue),
    pnl: toRoundUnit(cash + markedValue - Number(round?.budget || ROUND_BUDGET_TUSDC)),
  };
}

export function roundTradePreflight(round, address, nextBuyNotional = 0, now = Date.now()) {
  const status = roundStatus(round, now);
  const summary = roundTradeSummary(round, address);
  const issues = [];
  if (!roundPlayer(round, address)) issues.push("This wallet is not a player in this round.");
  if (status !== "live") issues.push(status === "waiting" ? "The rival has not joined this round yet." : "This trading round is no longer live.");
  if (summary.buyNotional + Number(nextBuyNotional) > Number(round.budget || ROUND_BUDGET_TUSDC)) issues.push("This trade exceeds the round budget cap.");
  return { ...summary, issues, ready: issues.length === 0 };
}

export function roundResult(round, marks = {}) {
  const creator = roundTradeSummary(round, round.creatorAddress, marks);
  const rival = roundTradeSummary(round, round.rivalAddress, marks);
  const creatorTraded = creator.tradeCount > 0;
  const rivalTraded = rival.tradeCount > 0;
  const difference = creator.pnl - rival.pnl;
  const draw = Math.abs(difference) < 0.01;
  return {
    eligible: Boolean(round.creatorAddress && round.rivalAddress && creatorTraded && rivalTraded),
    creator,
    rival,
    difference,
    winnerAddress: draw ? null : difference > 0 ? round.creatorAddress : round.rivalAddress,
    status: draw ? "draw" : "resolved",
  };
}

export function ratingTable(rounds = []) {
  const rows = new Map();
  const add = (address, patch) => {
    const key = normalizeAddress(address);
    if (!key) return;
    const current = rows.get(key) || { address: key, rating: RATING.START, wins: 0, losses: 0, draws: 0, rounds: 0, streak: 0, bestStreak: 0 };
    Object.assign(current, patch(current));
    rows.set(key, current);
  };

  for (const round of rounds.filter((item) => item.resultStatus === "resolved" || item.resultStatus === "draw" || item.resultStatus === "forfeit")) {
    const creator = normalizeAddress(round.creatorAddress);
    const rival = normalizeAddress(round.rivalAddress);
    if (!creator || !rival) continue;
    if (round.resultStatus === "draw") {
      add(creator, (row) => ({ ...row, rating: row.rating + RATING.DRAW, draws: row.draws + 1, rounds: row.rounds + 1, streak: 0 }));
      add(rival, (row) => ({ ...row, rating: row.rating + RATING.DRAW, draws: row.draws + 1, rounds: row.rounds + 1, streak: 0 }));
    } else {
      const winner = normalizeAddress(round.winnerAddress);
      add(creator, (row) => {
        const win = creator === winner;
        const streak = win ? row.streak + 1 : 0;
        const change = win ? RATING.WIN : round.resultStatus === "forfeit" ? RATING.FORFEIT_LOSS : RATING.LOSS;
        return { ...row, rating: row.rating + change, wins: row.wins + Number(win), losses: row.losses + Number(!win), rounds: row.rounds + 1, streak, bestStreak: Math.max(row.bestStreak, streak) };
      });
      add(rival, (row) => {
        const win = rival === winner;
        const streak = win ? row.streak + 1 : 0;
        const change = win ? RATING.WIN : round.resultStatus === "forfeit" ? RATING.FORFEIT_LOSS : RATING.LOSS;
        return { ...row, rating: row.rating + change, wins: row.wins + Number(win), losses: row.losses + Number(!win), rounds: row.rounds + 1, streak, bestStreak: Math.max(row.bestStreak, streak) };
      });
    }
  }
  return [...rows.values()].sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.address.localeCompare(b.address));
}

export function headToHead(rounds = [], firstAddress, secondAddress) {
  const first = normalizeAddress(firstAddress);
  const second = normalizeAddress(secondAddress);
  const matched = rounds.filter((round) => {
    const participants = [normalizeAddress(round.creatorAddress), normalizeAddress(round.rivalAddress)];
    return participants.includes(first) && participants.includes(second) && (round.resultStatus === "resolved" || round.resultStatus === "draw" || round.resultStatus === "forfeit");
  });
  const firstWins = matched.filter((round) => normalizeAddress(round.winnerAddress) === first).length;
  const secondWins = matched.filter((round) => normalizeAddress(round.winnerAddress) === second).length;
  const draws = matched.filter((round) => round.resultStatus === "draw").length;
  return { firstWins, secondWins, draws, rounds: matched.length, latest: matched.sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))[0] || null };
}
