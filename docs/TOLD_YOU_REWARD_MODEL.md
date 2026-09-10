# Told You reward model

## Live testnet MVP

No user funds are pooled or redistributed. A reward is a verified competitive record.

| Event | Rating | Social reward |
| --- | ---: | --- |
| PnL round win | +25 | Win, rivalry badge progress, streak +1 |
| PnL draw | +10 | Completed-duel record |
| Completed loss | +5 | Verified participation record, streak resets |
| GG / voluntary forfeit | -10 | Loss and streak reset; rival receives the win |

A round only affects Rating when both players recorded at least one Told You demo fill and a shared market mark is available. GG is the exception: it is an explicit voluntary loss, so it records immediately after both players are in the live round.

## GG rules

- GG never closes, transfers, or modifies wallet positions.
- The conceder can still separately sell or redeem their own Event Contract positions in DreamDEX.
- Told You stores conceder, winner, timestamp, and forfeit status in the public round record.
- The UI requires a second confirmation click to prevent accidental forfeits.

## Future business model

Told You remains free in the hackathon MVP. Future seasons may use sponsor-funded rewards tied to verified activity, rank, streaks, and rivalry badges. A later optional Duel Stakes module can use a dedicated audited escrow contract for fixed entry stakes and a published winner split. If DreamDEX later provides reliable builder attribution, a disclosed share of realized builder revenue could fund those seasons.

No token, airdrop, prize pool, custody, or reward distribution is active in this build.
