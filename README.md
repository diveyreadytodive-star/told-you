# Told You

**Told You turns DreamDEX Event Contracts into a five-minute, head-to-head trading duel.**

Two players bring the same tUSDC round budget, ready up, and independently trade BTC or ETH UP/DOWN Event Contract positions against one shared clock. The trader with the stronger mark-to-market PnL wins the rivalry.

## What the demo shows

- DreamDEX binary Event Contract discovery through `@somnia-chain/markets-sdk`
- BTC/ETH index prices and recent ticks through the Somnia testnet oracle price feed
- A shareable round link, equal 100 tUSDC budget check, and a synchronized Ready state
- Market and limit-style simulated entries and exits for safe testnet UX validation
- Open positions, common-mark PnL, head-to-head results, and a season Rating model

> **Execution disclosure:** this hackathon build reads real DreamDEX market data and Somnia oracle data. Its round fills are deliberately simulated at the displayed mark, so it never claims to have submitted a wallet order.

## Market-model integrity

Told You does not custody funds, pool bankrolls, force opposite positions, or redistribute player assets. Every player makes independent decisions. The local round record stores public addresses and demo trade metadata only.

If a valid shared market mark is unavailable at the round deadline, the round records no winner and does not change Rating. A data outage must never become a fabricated zero-value loss.

## Local setup

```bash
npm install
npm run check
npm run build
PORT=4175 node server.mjs
```

Open `http://127.0.0.1:4175`.

For a wallet-free fixture, open:

```text
http://127.0.0.1:4175/arena?demo=1&round=round-demo
```

## Hosted demo

The Vercel deployment serves the product UI, the DreamDEX market reads, and the Somnia oracle-price reads. It falls back to browser-local round storage when no hosted record service is configured. Persistent cross-device rivalry links therefore require a future KV or database-backed record service.

### Public Open Duels board

The public board uses the Vercel function at `/api/rounds` and Upstash Redis for durable cross-browser rounds. Connect the Upstash Marketplace integration to the Vercel project, then redeploy. The integration supplies these server-only variables automatically:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Until those variables are configured, the app shows an honest storage-unavailable state and only the isolated browser demo works. It does not claim that a public duel link can match users across devices.

## Routes

- `/` — product introduction
- `/arena` — create or join a duel
- `/arena?round=<id>` — live round board
- `/season` — rivalry record and Rating table

## Somnia and DreamDEX integration

The project targets Somnia Shannon testnet (`chainId: 50312`). It uses the official Markets SDK to discover binary markets, read on-chain status and order books, and query the Somnia testnet price feed. The app uses a direct `MarketCreated` log scan as a fallback when the public testnet indexer lags rolling Event Contract windows.

Use dedicated test wallets only. This repository contains no private keys and no wallet signing credentials.

## Submission assets

- [Pitch deck](deliverables/told-you-pitch-deck-v6.pptx)
- [DoraHacks copy and upload assets](deliverables/submission-assets/)
- [Round model](docs/TOLD_YOU_ROUND_DESIGN.md)
- [Reward roadmap](docs/TOLD_YOU_REWARD_MODEL.md)

## License

MIT. See [LICENSE](LICENSE).
