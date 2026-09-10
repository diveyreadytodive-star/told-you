import { SOMNIA_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk";
import { createPublicClient, http } from "viem";
import { somniaTestnet } from "viem/chains";
import { marketCreatorEventsAbi } from "../node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";

const rpcUrl = "https://dream-rpc.somnia.network";
const wsRpcUrl = "wss://api.infra.testnet.somnia.network/ws";
const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(rpcUrl) });
const event = marketCreatorEventsAbi.find((entry) => entry.name === "MarketCreated");
if (!event) throw new Error("MarketCreated event ABI is unavailable.");

const head = await publicClient.getBlockNumber();
const now = Math.floor(Date.now() / 1000);
const chunks = await Promise.all(
  Array.from({ length: 10 }, (_, index) => {
    const toBlock = head - BigInt(index * 1000);
    return publicClient
      .getLogs({ event, fromBlock: toBlock - 999n, toBlock })
      .then((logs) => logs.map((log) => log.args))
      .catch(() => []);
  }),
);

const candidate = [...new Map(
  chunks
    .flat()
    .filter(
      (market) =>
        Number(market.expiry) > now + 45 &&
        market.collateral?.toLowerCase() === SOMNIA_TESTNET_ADDRESSES.testUsdc.toLowerCase(),
    )
    .map((market) => [market.marketId?.toLowerCase(), market]),
).values()].sort((left, right) => Number(left.expiry) - Number(right.expiry))[0];

if (!candidate?.marketId || !candidate.pool) {
  throw new Error("No current tUSDC Event Contract was found in recent MarketCreated logs.");
}

const exchange = new SomniaMarkets({
  indexerUrl: "https://187.124.114.32.nip.io/v1/graphql",
  chain: somniaTestnet,
  wsRpcUrl,
  addresses: SOMNIA_TESTNET_ADDRESSES,
});
const onchain = await exchange.client.getMarketOnchain(candidate.marketId);
const [bids, asks] = await Promise.all([
  exchange.client.getAllOpenOrdersOnchain(candidate.pool, { isBid: true }),
  exchange.client.getAllOpenOrdersOnchain(candidate.pool, { isBid: false }),
]);

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      marketId: candidate.marketId,
      asset: candidate.asset,
      pool: candidate.pool,
      expiry: new Date(Number(onchain.expiry) * 1000).toISOString(),
      status: onchain.status,
      statusLabel: ["Listed", "Trading", "Locked", "Settling", "Resolved", "Voided"][onchain.status],
      isResolved: onchain.isResolved,
      isVoided: onchain.isVoided,
      yesId: onchain.yesId.toString(),
      noId: onchain.noId.toString(),
      collateralDecimals: onchain.decimals,
      openBids: bids.orders?.length || 0,
      openAsks: asks.orders?.length || 0,
    },
    null,
    2,
  ),
);

await exchange.close();

if (onchain.status !== 1 || onchain.isResolved || onchain.isVoided) process.exitCode = 2;
