# LAST CALL design system

Every page and every agent follows this file. Page-level colour or font choices outside it are drift.

## Idea

A flight-information display at a real airport (Schiphol, Changi): white type on deep blue-black, colour reserved for status. The product tells holders a deadline is coming or has passed, so the page has to read like an official board, not a trading terminal and not a crypto dashboard.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0D14` | page |
| `--panel` | `#111623` | cards, board rows |
| `--panel-2` | `#161C2B` | flap tiles, inputs |
| `--line` | `#222A3B` | hairlines, 1px borders |
| `--text` | `#ECEEF2` | primary type and numbers |
| `--text-2` | `#A3ABBA` | secondary copy |
| `--text-3` | `#6B7385` | labels, metadata |
| `--closed` | `#FF5A4E` | GATE CLOSED status, and the primary Convert button |
| `--final` | `#F2B441` | FINAL CALL status only (deadline within 30 days); nowhere else |
| `--boarding` | `#37D38C` | BOARDING status |
| `--awaiting` | `#6B7385` | AWAITING IPO chips |

Yellow or amber text above 10% of visible text elements fails `frontend/check5.mjs`.

## Type

Geist Sans for prose and UI labels. Geist Mono for every number, address, token code and flap tile, with tabular figures. One uppercase tracked eyebrow per page at most.

Scale (px): 12, 14, 16, 20, 28, 40, 64. Weights: 400 and 600 only; hierarchy comes from size and colour, not extra weights.

## Space and shape

Spacing on a 4px grid: 4, 8, 12, 16, 24, 32, 48, 72. Radius 6 on cards, chips and buttons; flap tiles radius 3. Borders are 1px `--line`; no drop shadows.

## Components

- **SplitFlap**: one tile per character, hinge line across the middle, flips with rotateX and opacity, 30ms stagger, 260ms ease-out. Disabled under `prefers-reduced-motion`.
- **Status chip**: 1px border and text in the status colour, transparent fill.
- **Timeline**: SVG line with labelled markers (IPO, lockup unlocks, Deadline, Today). Elapsed part in `--text-2`, remaining in `--line`, a passed deadline in `--closed`.
- **Addresses**: shortened in Geist Mono, always a link to `https://solscan.io/account/<address>`, full address in `title`. Signatures link to `https://solscan.io/tx/<sig>`.

## Copy

Plain and factual. Numbers come from live reads and say when they were read. The board and the wallet lookup are for every holder; the fee sponsor is the path for wallets with no SOL.

## Layout

Content max width 1200px. Below 640px the board and tables become stacked cards; no horizontal scroll at 375px (`frontend/check4.mjs`).
