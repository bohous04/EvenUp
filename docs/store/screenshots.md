# Store screenshots — required sizes & how to capture

## Required sizes

### App Store (iOS)
At least one set is mandatory; App Store Connect up-scales a 6.7" set to smaller
iPhones, so **6.7" is the minimum you must provide**.

| Device class | Portrait px | Notes |
|---|---|---|
| 6.7" iPhone (15/16 Pro Max) | 1290 × 2796 | **Required** |
| 6.5" iPhone | 1242 × 2688 | Optional (auto-scaled from 6.7") |
| 5.5" iPhone (8 Plus) | 1242 × 2208 | Optional, only if you support older layouts |
| 12.9" iPad Pro | 2048 × 2732 | **Required if `supportsTablet`** (it is) |

3–10 screenshots per set.

### Google Play (Android)
| Asset | Size |
|---|---|
| Phone screenshots (2–8) | min 1080 px on the short side, 16:9 or 9:16 |
| Feature graphic (required) | 1024 × 500 PNG/JPG |
| App icon | 512 × 512 (uploaded in Console, separate from the in-app icon) |

## Suggested shot list (5 screens, tells the product story)

1. **Groups dashboard** — a couple of groups with member chips.
2. **Add expense** — the split-type selector + colored member chips.
3. **Receipt scan → itemized** — the chip-assignment editor with a receipt's items.
4. **Balances + Next round** — balances list and the "Next one's on…" card.
5. **Settle up (QR)** — the SPAYD QR settle sheet.

## How to capture (deterministic, seeded data)

```bash
cd apps/mobile
# 1. Launch on a 6.7" simulator (iPhone 16 Pro Max) and an iPad Pro 12.9"
EXPO_PUBLIC_API_URL=https://evenup.lnrt.cz pnpm ios --device "iPhone 16 Pro Max"
# 2. Sign in with the demo account and open a group seeded with a few expenses.
# 3. Capture with the simulator: Device ▸ Trigger Screenshot (⌘S) → saves to Desktop.
# 4. Repeat on the iPad Pro 12.9" simulator for the tablet set.
# 5. Android: run on a Pixel 7 Pro emulator and use the emulator camera button.
```

Frame them (optional) with a tool like [fastlane frameit] or upload raw. Keep
them in `docs/store/assets/` if you want them versioned (git-ignore large PNGs
if the repo shouldn't carry them).

## Feature graphic (Play, required)

1024 × 500. A simple brand-blue (`#2563eb`) background with the EvenUp wordmark
and the tagline "Split group expenses" is sufficient and passes review.
