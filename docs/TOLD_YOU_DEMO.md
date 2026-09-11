# Told You public-duel demo flow

Target duration: 2 minutes 20 seconds.

## 0:00-0:35 — Hero screen

Show the product hero.

> Prediction markets are powerful, but the trading experience is usually solitary. Told You turns DreamDEX Event Contracts into a social trading duel. We use the DreamDEX Markets SDK for public BTC and ETH outcome prices and the Somnia oracle feed for the underlying asset price.

## 0:35-0:55 — Open Duels board

Open `/arena` and show the public board.

> Any trader can create an open duel. The board shows an anonymous wallet shorthand, the fixed 100 tUSDC budget, waiting time, and a Join action. A public round is stored in Redis, so a rival can open it from another browser session.

## 0:55-1:25 — Two-wallet match

In browser profile A, connect the creator wallet and create a round. In browser profile B, reload `/arena`, select the waiting duel, connect a different wallet, and join.

> The creator cannot join their own duel, and a full or expired round cannot accept another rival. Told You does not custody funds or force a player onto an opposite position.

## 1:25-1:45 — Ready and synchronized start

On both screens, press Ready after the funding check. Show the timer begin.

> Both wallets pass the same 100 tUSDC funding check. The five-minute timer starts only when both players are ready, so neither player has a timing advantage.

## 1:45-2:05 — Trading interaction

Use the public demo route for deterministic trade interaction if a live market window is unavailable:

`/arena?demo=1&round=round-demo`

Point to the index price, price chart, UP/DOWN outcome prices, and timer. Click **Record demo trade**, then show the Open Position row update. Click **Close** and show Market, Limit, and quantity controls.

> The asset index and the Event Contract probability are separate signals. A demo trade updates quantity, average entry, marked value, and PnL immediately.

## 2:05-2:20 — Integrity and return loop

Show the score cards and Season route.

> The same public outcome mark scores both traders. If no verified common mark is available, Told You records no winner and no Rating update. Finished rounds create rivalry history and seasonal Rating. Future seasons can add leaderboard visibility, badges, and transparent sponsor or token incentives.

## Required disclosure

> DreamDEX market data and Somnia oracle data are live. This hackathon build records simulated execution at the displayed mark and does not claim that a wallet order was submitted.
