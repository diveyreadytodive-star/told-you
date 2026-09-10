# Told You pitch roadmap

## What is live today

Told You is a non-custodial Shannon testnet trading duel.

- Two dedicated wallets join the same timed round.
- Both pass the same round-budget funding check.
- Each independently makes demo trades against live DreamDEX BTC/ETH Event Contract marks.
- Recorded demo fills and a common live mark determine round PnL.
- Rating, head-to-head record, streaks, and rivalry badges reward competitive performance.

No user funds are pooled, transferred, or redistributed in the current build.

## What comes next: Duel Stakes

Once the trading loop and anti-self-play rules are proven, Told You can add an optional on-chain Duel Stakes module.

Both players opt into a fixed entry stake. A smart contract holds the stake, not Told You servers. After the timed DreamDEX trading round, the winner claims the published share of the pot.

The intended rule is fixed entry stakes rather than high per-trade fees. It keeps trading behavior driven by strategy, while giving a duel clear financial stakes.

## Why this is a roadmap, not a live claim

- A winner-take-pot model requires a dedicated escrow contract and independent security review.
- It needs self-play, collusion, tie, cancellation, and dispute rules.
- The current testnet MVP deliberately does not custody, pool, charge, or distribute funds.

## Pitch wording

Today, Told You turns live Event Contract market data into a non-custodial timed-duel demo. Tomorrow, protocol-native execution and optional on-chain Duel Stakes can let verified rivals put a fixed stake behind their conviction without turning the app server into a custodian.

## Slide placement

Use this as the final roadmap slide after product loop, technical proof, and retention:

1. Current: Rating, rivalries, streaks, top trader cards.
2. Next: optional fixed-stake DuelVault for settled rounds.
3. Later: sponsor-funded seasons and verified trader rewards.
