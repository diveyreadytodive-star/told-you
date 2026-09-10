# Told You — testnet trading duel design

## Product rule

Told You is a timed trading duel, not a forced-opposite prediction.

1. A Creator opens a five-minute round.
2. A Rival joins with a different dedicated Shannon test wallet.
3. Both click **Ready** after Told You verifies each dedicated wallet holds at least the same **100 tUSDC round budget cap**. The timer does not start until both are ready.
4. During the round, each player independently records simulated buy or sell actions for UP/DOWN positions on eligible live BTC/ETH DreamDEX Event Contracts. The displayed marks come from public DreamDEX data; tracked trade count is not capped.
5. At the round deadline, the score is mark-to-market PnL from trades recorded by Told You:

```
round equity = round cash + marked value of open outcome positions
round PnL    = round equity - 100 tUSDC
```

The mark is the latest valid public DreamDEX outcome midpoint. It is an in-round score, not a claim that the market has settled. If a shared mark is unavailable, the round records no winner and does not change Rating.

## Fairness boundary

- Both players use separate, funded test wallets.
- The app records only demo trades created through Told You and rejects cumulative buy notional above the round budget cap.
- Wallet balances outside the recorded round are not treated as PnL.
- A player can close all or part of a demo outcome position at the displayed market mark or a selected limit mark.
- The round score uses the same mark timestamp for every open position in its displayed snapshot.

This is fair enough for a testnet skill duel, not a production-grade anti-cheat tournament. Production would need a server-authoritative event indexer, signed start snapshots, and a constrained execution account.

## Technical flow

```
Creator wallet ─┐
                ├─ round record: budget, deadline, tracked trades ── Told You record service
Rival wallet ───┘
       │
       ├─ public market and outcome-price reads ── DreamDEX BinaryPool
       └─ simulated buy / sell record ── Told You round ledger

Live outcome midpoint
        ↓
round ledger and mark-to-market PnL
```

## Explicitly not claimed

- No custody or pooled bankroll
- No promise of equal real-world wallet balances
- No private fill or private matching
- No financial reward, airdrop, token, or mainnet operation
