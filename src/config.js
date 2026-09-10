import { somniaTestnet } from "viem/chains";

export const NETWORK = {
  chain: somniaTestnet,
  chainId: 50312,
  chainIdHex: "0xc488",
  indexerUrl:
    import.meta.env.VITE_DREAMDEX_INDEXER_URL ||
    "https://187.124.114.32.nip.io/v1/graphql",
  wsRpcUrl:
    import.meta.env.VITE_SOMNIA_RPC_URL ||
    "wss://api.infra.testnet.somnia.network/ws",
};

export const APP_ORIGIN = window.location.origin;

export const STATUS = {
  0: "Listed",
  1: "Trading",
  2: "Locked",
  4: "Resolved",
  5: "Voided",
};

export function demoMarket() {
  return {
    marketId: "demo-fixture-no-chain-write",
    symbol: "BTC-DEMO/USDso#YES",
    asset: "BTC",
    status: "Trading",
    secondsLeft: 530,
    expiry: new Date(Date.now() + 530_000).toISOString(),
    upSymbol: "BTC-DEMO/USDso#YES",
    downSymbol: "BTC-DEMO/USDso#NO",
    upBid: 0.58,
    upAsk: 0.62,
    upMidpoint: 0.6,
    downMidpoint: 0.4,
    pool: null,
    oracleQuestionId: "",
    spotPrice: 104230.42,
    spotTicks: [103920, 103980, 104040, 104010, 104120, 104070, 104180, 104230.42],
    isFixture: true,
  };
}

export function demoMarkets() {
  const now = Date.now();
  return [
    demoMarket(),
    {
      marketId: "demo-eth-fixture-no-chain-write",
      symbol: "ETH-DEMO/USDso#YES",
      asset: "ETH",
      status: "Trading",
      secondsLeft: 890,
      expiry: new Date(now + 890_000).toISOString(),
      upSymbol: "ETH-DEMO/USDso#YES",
      downSymbol: "ETH-DEMO/USDso#NO",
      upBid: 0.46,
      upAsk: 0.5,
      upMidpoint: 0.48,
      downMidpoint: 0.52,
      pool: null,
      oracleQuestionId: "",
      spotPrice: 3976.18,
      spotTicks: [3930, 3942, 3947, 3938, 3956, 3964, 3958, 3976.18],
      isFixture: true,
    },
  ];
}
