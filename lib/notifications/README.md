# Notification Operations

This directory is the shared home for user-facing notification behavior.

- `client-toast.ts`: the single import point for immediate Sonner toasts.
- `operation-catalog.ts`: the living inventory of operations that can show a toast, app banner, notification-center item, or confirmation prompt.
- `types.ts`: notification-center item types.

## Surfaces

- `toast`: immediate Sonner toasts.
- `notification-banner`: animated in-app banners rendered by `GlobalNotificationOverlay`.
- `notification-feed`: items shown in the notification center.
- `confirm-dialog`: native confirmation prompts that interrupt an operation.

## Current Operation Groups

| Area | Operations | Surfaces |
| --- | --- | --- |
| Commerce | Store course copy/purchase, notebook purchase, store notebook move | Toast, banner/feed, confirm |
| Course | Delete, publish/unpublish, notebook info updates, course material upload/download/delete | Toast, confirm |
| Generation | Notebook creation queue, classroom resume generation, media generation, publisher sync | Toast, banner, confirm |
| Stage | Sidebar Q&A, playback, TTS generation, slide repair, reflow, rerender, element/media editing | Toast |
| Export | PPTX export success/failure | Toast |
| Problem bank | Practice submission, code runs, import preview/commit, draft edits, delete confirmations | Toast, banner, confirm |
| Review | Route generation, AI problem fill, route deletion, challenge completion, reward withdraw | Toast, banner, confirm |
| Study companion | Notebook ready, review route ready, mistake memory, quiz progress, practice feedback | Banner |
| Credits | Stripe checkout, credit conversion, low balance, purchase/spend/reward transaction feed | Toast, banner/feed |
| Gamification | Daily/course rewards, character/avatar/cosmetic unlocks, companion settings | Toast, banner/feed |
| Profile | Avatar upload validation | Toast |
| Settings | Cache clearing, missing model setup notices | Toast |
| Whiteboard | Restore history, clear whiteboard | Toast |
| Admin | Admin login, credit grants, unlock/backfill actions | Toast, confirm |

`operation-catalog.ts` also lists every notification-center transaction source, including purchases, creator revenue, token usage, cash-to-credit transfers, learning rewards, cosmetic unlock spends, low-balance reminders, and grouped entries.

## Add A New Notification Operation

1. Add the UI call through `@/lib/notifications/client-toast` or the notification store/server mapper.
2. Add or update an entry in `NOTIFICATION_OPERATION_CATALOG`.
3. Choose the surface explicitly: `toast`, `notification-banner`, `notification-feed`, or `confirm-dialog`.
4. Keep `sourceFiles` pointed at the files that can trigger the user-facing message.
