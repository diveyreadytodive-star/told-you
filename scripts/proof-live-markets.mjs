import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { createPublicClient, http } from "viem";
import { somniaTestnet } from "viem/chains";
import { marketCreatorEventsAbi } from "../node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http("https://dream-rpc.somnia.network"),
});
const marketCreated = marketCreatorEventsAbi.find((entry) => entry.name === "MarketCreated");
if (!marketCreated) throw new Error("MarketCreated event ABI is unavailable.");

const now = Math.floor(Date.now() / 1000);
const head = await publicClient.getBlockNumber();
const windows = Array.from({ length: 10 }, (_, index) => {
  const toBlock = head - BigInt(index * 1000);
  return publicClient
    .getLogs({ event: marketCreated, fromBlock: toBlock - 999n, toBlock })
    .then((logs) => logs.map((log) => log.args))
    .catch(() => []);
});
const markets = (await Promise.all(windows)).flat();
const active = [...new Map(
  markets
    .filter(
      (market) =>
        Number(market.expiry) > now + 45 &&
        market.collateral?.toLowerCase() === SOMNIA_TESTNET_ADDRESSES.testUsdc.toLowerCase(),
    )
    .map((market) => [market.marketId?.toLowerCase(), market]),
).values()].sort((left, right) => Number(left.expiry) - Number(right.expiry));

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      source: "on-chain MarketCreated logs via official DreamDEX starter fallback",
      head: head.toString(),
      scannedMarketCreatedEvents: markets.length,
      activeMarkets: active.map((market) => ({
        marketId: market.marketId,
        asset: market.asset,
        expiry: new Date(Number(market.expiry) * 1000).toISOString(),
        pool: market.pool,
        intervalSeconds: market.intervalSec?.toString(),
      })),
      activeTradingMarketCount: active.length,
    },
    null,
    2,
  ),
);

if (!active.length) process.exitCode = 2;
