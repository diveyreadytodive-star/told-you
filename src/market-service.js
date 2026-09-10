import {
  ORDER_TYPE,
  probabilityToPrice,
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  isBinaryMarket,
} from "@somnia-chain/markets-sdk";
import { createPublicClient, createWalletClient, custom, formatEther, formatUnits, http } from "viem";
import { marketCreatorEventsAbi } from "../node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";
import { NETWORK, STATUS } from "./config.js";

let exchange;
let configuredWallet;
let configuredAddress;
const chainReader = createPublicClient({
  chain: NETWORK.chain,
  transport: http("https://dream-rpc.somnia.network"),
});
const marketCreatedEvent = marketCreatorEventsAbi.find((entry) => entry.name === "MarketCreated");

function getExchange() {
  if (exchange) return exchange;
  exchange = new SomniaMarkets({
    indexerUrl: NETWORK.indexerUrl,
    chain: NETWORK.chain,
    wsRpcUrl: NETWORK.wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    priceFeed: SOMNIA_TESTNET_PRICE_FEED,
  });
  return exchange;
}

// The Markets SDK owns the Somnia oracle price-feed client as well as the
// order-book client. Keeping this read here makes the spot quote and chart
// independently verifiable from the contract's UP/DOWN probability.
export async function readLivePriceTelemetry(assets = ["BTC", "ETH"]) {
  const unique = [...new Set(assets.map((asset) => String(asset).toUpperCase()))];
  if (!unique.length) return {};
  const client = getExchange().client;
  const [prices, histories] = await Promise.all([
    client.fetchPrices(unique),
    Promise.all(
      unique.map((asset) =>
        client.fetchPriceHistory(asset, { limit: 36 }).catch(() => []),
      ),
    ),
  ]);
  const byAsset = Object.fromEntries(prices.map((price) => [price.asset.toUpperCase(), price]));
  return Object.fromEntries(
    unique.map((asset, index) => [
      asset,
      {
        price: byAsset[asset]?.price ?? null,
        ema: byAsset[asset]?.ema ?? null,
        updatedAt: byAsset[asset]?.blockTimestamp ?? null,
        // The SDK returns history newest first. The SVG needs oldest first.
        ticks: [...histories[index]].reverse(),
      },
    ]),
  );
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectOutcome(market, side) {
  const outcomes = market.outcomes || [];
  if (side === "UP") return outcomes[0];
  return outcomes[1];
}

export async function listLiveMarkets() {
  const client = getExchange();
  const now = Date.now() / 1000;
  let loaded = [];
  try {
    loaded = Object.values(await client.loadMarkets(true));
  } catch {
    // The public testnet indexer can lag or be unavailable. Direct log discovery below is canonical fallback.
  }
  const binaryMarkets = [];

  for (const market of loaded) {
    if (!market.active || !isBinaryMarket(market.info)) continue;
    let onchain;
    try {
      onchain = await client.client.getMarketOnchain(market.info.marketId);
    } catch {
      // A stale indexed row must not prevent direct MarketCreated-log discovery.
      continue;
    }
    const secondsLeft = Math.max(0, number(onchain.expiry) - now);
    const up = selectOutcome(market, "UP");
    const down = selectOutcome(market, "DOWN");
    if (!up || !down) continue;

    let upBook = { bids: [], asks: [] };
    try {
      upBook = await client.fetchOrderBook(up.symbol, 5);
    } catch {
      // Market discovery still works when a just-created market has no indexed book yet.
    }

    const bestBid = number(upBook.bids?.[0]?.[0], 0);
    const bestAsk = number(upBook.asks?.[0]?.[0], 0);
    const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk || 0.5;

    binaryMarkets.push({
      marketId: market.info.marketId,
      symbol: market.symbol,
      asset: market.info.asset || market.symbol.split("-")[0] || "Market",
      status: STATUS[number(onchain.status)] || `Unknown (${onchain.status})`,
      secondsLeft,
      expiry: new Date(number(onchain.expiry) * 1000).toISOString(),
      upSymbol: up.symbol,
      downSymbol: down.symbol,
      upBid: bestBid,
      upAsk: bestAsk,
      upMidpoint: midpoint,
      downMidpoint: 1 - midpoint,
      pool: onchain.pool,
      oracleQuestionId: String(onchain.oracleQuestionId || ""),
    });
  }

  const indexedLive = binaryMarkets
    .filter((market) => market.secondsLeft > 0)
    .sort((left, right) => left.secondsLeft - right.secondsLeft);
  if (indexedLive.length) return indexedLive;

  return discoverLiveMarketsFromChain(now, client);
}

async function discoverLiveMarketsFromChain(now, client) {
  if (!marketCreatedEvent) throw new Error("The installed Markets SDK does not expose the MarketCreated event ABI.");
  const head = await chainReader.getBlockNumber();
  const scanWindows = 10;
  const windows = Array.from({ length: scanWindows }, (_, index) => {
    const toBlock = head - BigInt(index * 1000);
    return chainReader
      .getLogs({ event: marketCreatedEvent, fromBlock: toBlock - 999n, toBlock })
      .then((logs) => logs.map((log) => log.args))
      .catch(() => []);
  });
  const created = (await Promise.all(windows)).flat();
  const live = created
    .filter(
      (market) =>
        Number(market.expiry) > now + 45 &&
        market.collateral?.toLowerCase() === SOMNIA_TESTNET_ADDRESSES.testUsdc.toLowerCase(),
    )
    .sort((left, right) => Number(left.expiry) - Number(right.expiry));

  const unique = [...new Map(live.map((market) => [market.marketId?.toLowerCase(), market])).values()];
  const models = [];
  for (const market of unique) {
    if (!market.marketId || !market.pool) continue;
    let onchain;
    let bids = { orders: [] };
    let asks = { orders: [] };
    try {
      onchain = await client.client.getMarketOnchain(market.marketId);
      if (Number(onchain.status) !== 1) continue;
      [bids, asks] = await Promise.all([
        client.client.getAllOpenOrdersOnchain(market.pool, { isBid: true }),
        client.client.getAllOpenOrdersOnchain(market.pool, { isBid: false }),
      ]);
    } catch {
      // Keep another live contract usable if one pool's order-book endpoint is unavailable.
      continue;
    }
    const scale = 10 ** onchain.decimals;
    const bestBid = Math.max(0, ...(bids.orders || []).map((order) => Number(order.price) / scale));
    const rawAsk = Math.min(Infinity, ...(asks.orders || []).map((order) => Number(order.price) / scale));
    const bestAsk = Number.isFinite(rawAsk) ? rawAsk : 0;
    const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk || 0.5;
    models.push({
      marketId: market.marketId,
      symbol: `${market.asset}-${market.marketId.slice(-6)}`,
      asset: market.asset || "Market",
      status: STATUS[Number(onchain.status)] || `Unknown (${onchain.status})`,
      secondsLeft: Math.max(0, Number(onchain.expiry) - now),
      expiry: new Date(Number(onchain.expiry) * 1000).toISOString(),
      upSymbol: null,
      downSymbol: null,
      upBid: bestBid,
      upAsk: bestAsk,
      upMidpoint: midpoint,
      downMidpoint: 1 - midpoint,
      pool: market.pool,
      oracleQuestionId: String(market.oracleQuestionId || ""),
      source: "onchain-log-fallback",
    });
  }
  return models;
}

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Install a Somnia-compatible browser wallet to sign testnet orders.");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0];
  if (!address) throw new Error("Wallet did not return an account.");

  const currentChain = await window.ethereum.request({ method: "eth_chainId" });
  if (String(currentChain).toLowerCase() !== NETWORK.chainIdHex) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: NETWORK.chainIdHex }],
      });
    } catch (error) {
      if (error?.code !== 4902) throw error;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: NETWORK.chainIdHex,
            chainName: "Somnia Shannon Testnet",
            nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
            rpcUrls: ["https://dream-rpc.somnia.network"],
            blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
          },
        ],
      });
    }
  }

  configuredWallet = createWalletClient({
    account: address,
    chain: NETWORK.chain,
    transport: custom(window.ethereum),
  });
  configuredAddress = address;
  getExchange().setSigner({ account: address, walletClient: configuredWallet });
  return address;
}

export async function readTestnetBalances(address) {
  const [stt, tUsdc] = await Promise.all([
    chainReader.getBalance({ address }),
    chainReader.readContract({
      address: SOMNIA_TESTNET_ADDRESSES.testUsdc,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [address],
    }),
  ]);
  return { stt: formatEther(stt), tUsdc: formatUnits(tUsdc, 6) };
}

export async function claimTestUsdc() {
  if (!configuredWallet) throw new Error("Connect a Shannon testnet wallet before requesting test collateral.");
  const result = await getExchange().trader.faucet();
  if (!result.hash || result.receipt.status !== "success") {
    throw new Error("The test tUSDC faucet transaction did not confirm.");
  }
  return result.hash;
}

export async function placeTestnetOrder({ market, side, quantity, maxPrice, resting = false }) {
  if (!configuredWallet) throw new Error("Connect a Shannon testnet wallet before signing an order.");
  if (market.status !== "Trading") throw new Error("This market is not trading anymore. Refresh and choose a current window.");
  if (market.secondsLeft < 300) throw new Error("This window has under five minutes remaining. Choose the next live market so your friend has time to join.");

  const client = getExchange();
  const fresh = await client.client.getMarketOnchain(market.marketId);
  if (number(fresh.status) !== 1) throw new Error("The market locked before signing. No transaction was sent.");
  const collateralScale = 10 ** fresh.decimals;
  const rawQuantity = BigInt(Math.round(Number(quantity) * collateralScale));
  if (rawQuantity <= 0n) throw new Error("Quantity is below the testnet market's minimum precision.");
  const visibleSidePrice = Number(maxPrice);
  if (!Number.isFinite(visibleSidePrice) || visibleSidePrice <= 0 || visibleSidePrice >= 1) {
    throw new Error("Maximum price must be strictly between 0 and 1.");
  }
  // The raw pool quotes every order in YES (UP) probability terms. A user-visible
  // DOWN ceiling of 0.40 therefore becomes a YES price of 0.60.
  const yesProbability = side === "UP" ? visibleSidePrice : 1 - visibleSidePrice;
  const order = await client.trader.placeOrder({
    pool: market.pool,
    side: side === "UP" ? "BUY_YES" : "BUY_NO",
    price: probabilityToPrice(yesProbability),
    quantity: rawQuantity,
    // The creator rests a public invitation; the challenger then crosses the
    // complementary side. Using IOC for both legs would cancel both on an empty book.
    orderType: resting ? ORDER_TYPE.POST_ONLY : ORDER_TYPE.MARKET,
    expireTimestampNs: BigInt(Math.floor(Math.min(Date.now() / 1000 + 120, Number(fresh.expiry) - 5))) * 1_000_000_000n,
  });
  if (!order.hash || order.receipt.status !== "success") {
    throw new Error("DreamDEX did not confirm the testnet order. It was not recorded as successful.");
  }
  return {
    transactionHash: order.hash,
    orderId: String(order.orderId || ""),
    filled: Number(order.fills?.reduce((sum, fill) => sum + Number(fill.quantityFilled), 0n)) / collateralScale,
    amount: Number(quantity),
  };
}

function binaryOrderSide(outcome, action) {
  if (action === "sell") return outcome === "UP" ? "SELL_YES" : "SELL_NO";
  return outcome === "UP" ? "BUY_YES" : "BUY_NO";
}

function fillSummary(fills, outcome, scale) {
  return fills.reduce(
    (summary, fill) => {
      const quantity = Number(fill.quantityFilled) / scale;
      const yesPrice = Number(fill.fillPrice) / scale;
      const outcomePrice = outcome === "UP" ? yesPrice : 1 - yesPrice;
      return {
        quantity: summary.quantity + quantity,
        notional: summary.notional + quantity * outcomePrice,
      };
    },
    { quantity: 0, notional: 0 },
  );
}

/**
 * Executes a round trade with a real binary-market IOC.
 * Buys use an SDK stake quote; sells use the wallet's outcome balance and a
 * partial-fill-aware sell quote.
 */
export async function placeRoundTrade({ market, outcome, action = "buy", stake, mode = "market", quantity, limitPrice }) {
  if (!configuredWallet) throw new Error("Connect a Shannon testnet wallet before trading.");
  if (market.status !== "Trading") throw new Error("This market is not trading anymore.");
  if (market.secondsLeft <= 0) throw new Error("This market has already locked.");

  const exchangeClient = getExchange();
  const fresh = await exchangeClient.client.getMarketOnchain(market.marketId);
  if (number(fresh.status) !== 1) throw new Error("The market locked before signing. No transaction was sent.");
  const scale = 10 ** fresh.decimals;
  const side = binaryOrderSide(outcome, action);
  let quote;

  if (action === "sell") {
    const balances = await readWalletPositions(configuredAddress, market);
    const rawPosition = BigInt(outcome === "UP" ? balances.up : balances.down);
    if (rawPosition <= 0n) throw new Error("No " + outcome + " outcome position is available to sell.");
    quote = await exchangeClient.client.quoteBinarySell({ pool: market.pool, side, quantity: rawPosition });
    if (!quote) throw new Error("No executable bid is available to close this position.");
    if (quote.fillableQuantity < quote.quantity) {
      throw new Error("Only part of this position is currently liquid. Wait for more bids or trade a smaller amount.");
    }
  } else if (mode === "limit") {
    const rawQuantity = BigInt(Math.round(Number(quantity) * scale));
    const visiblePrice = Number(limitPrice);
    if (rawQuantity <= 0n) throw new Error("Limit quantity must be positive.");
    if (!Number.isFinite(visiblePrice) || visiblePrice <= 0 || visiblePrice >= 1) {
      throw new Error("Limit price must be between 0.01 and 0.99.");
    }
    quote = {
      side,
      quantity: rawQuantity,
      yesPrice: probabilityToPrice(outcome === "UP" ? visiblePrice : 1 - visiblePrice),
    };
  } else {
    const rawStake = BigInt(Math.round(Number(stake) * scale));
    if (rawStake <= 0n) throw new Error("Round trade size must be positive.");
    quote = await exchangeClient.client.quoteBinaryStake({ pool: market.pool, side, stake: rawStake });
    if (!quote) {
      // The SDK stake quote relies on its live book store. In a browser that has
      // just loaded the round, that watch may not be warm yet even though the
      // direct on-chain discovery path supplied a current midpoint. Use a
      // bounded protective IOC price in that case; confirmed fills remain the
      // sole source of recorded round PnL.
      const visibleMark = Number(outcome === "UP" ? market.upMidpoint : market.downMidpoint);
      if (!Number.isFinite(visibleMark) || visibleMark <= 0 || visibleMark >= 1) {
        throw new Error("No live price is available for this outcome yet. Wait for the next book update.");
      }
      const protectedOutcomePrice = Math.min(0.99, visibleMark + 0.05);
      const rawQuantity = BigInt(Math.floor((Number(stake) / protectedOutcomePrice) * scale));
      if (rawQuantity <= 0n) throw new Error("Round trade size is below the market minimum.");
      quote = {
        side,
        quantity: rawQuantity,
        yesPrice: probabilityToPrice(outcome === "UP" ? protectedOutcomePrice : 1 - protectedOutcomePrice),
      };
    }
  }

  const result = await exchangeClient.trader.placeOrder({
    pool: market.pool,
    side: quote.side,
    price: quote.yesPrice,
    quantity: quote.quantity,
    orderType: ORDER_TYPE.MARKET,
    expireTimestampNs: BigInt(Math.floor(Math.min(Date.now() / 1000 + 120, Number(fresh.expiry) - 5))) * 1_000_000_000n,
  });
  if (!result.hash || result.receipt.status !== "success") throw new Error("DreamDEX did not confirm this round trade.");

  const filled = fillSummary(result.fills || [], outcome, scale);
  if (filled.quantity <= 0) throw new Error("This IOC did not fill. No round trade was recorded.");
  return {
    transactionHash: result.hash,
    orderId: String(result.orderId || ""),
    outcome,
    action,
    filledQuantity: filled.quantity,
    filledNotional: filled.notional,
    averagePrice: filled.notional / filled.quantity,
  };
}

export async function readWalletPositions(address, market) {
  const client = getExchange();
  const fresh = await client.client.getMarketOnchain(market.marketId);
  const [up, down] = await Promise.all([
    client.client.getOutcomeBalance(fresh.outcomeToken, address, fresh.yesId),
    client.client.getOutcomeBalance(fresh.outcomeToken, address, fresh.noId),
  ]);
  return { up: String(up), down: String(down) };
}

export async function readCanonicalResult(marketId) {
  const onchain = await getExchange().client.getMarketOnchain(marketId);
  const status = STATUS[number(onchain.status)] || `Unknown (${onchain.status})`;
  return {
    status,
    winningSide: onchain.isResolved ? (number(onchain.winningOutcome) === 0 ? "UP" : "DOWN") : null,
    isVoided: Boolean(onchain.isVoided),
  };
}

export function explorerTxUrl(hash) {
  return `https://shannon-explorer.somnia.network/tx/${hash}`;
}

export function oracleUrl(questionId) {
  return questionId ? `https://prd.oracle.somnia.host/questions/${questionId}?view=graph` : null;
}
