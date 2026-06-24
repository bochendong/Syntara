final result: passed

# Design QA

Source visual target: ImageGen option 2, "Annotated Thinking" for the Syntara homepage.

Implemented target: http://localhost:3000/

Checks:
- Cool blue-white background replaces the previous warm paper tone.
- Hero uses one large serif headline with no inline image pills.
- Education signals are visible in the first screen: equation, graph trace, definition note, derivative reminder, problem card, code trace, and key idea note.
- Three-screen scroll states remain intact:
  - Screen 1: hero and education layer visible.
  - Screen 2: orbit/practice state lands in a triangular orb arrangement, with the top blue-purple orb, lower-left red-purple orb, and lower-right green-blue orb around the ring.
  - Screen 3: laptop visible, orbit and education layer hidden.
- Browser check at 1440x900 confirmed the second-screen terminal state has `screenTwo = 1`, `screenThree = 0`, education opacity `0`, laptop opacity `0`, and no horizontal overflow.
- The scroll section height and motion thresholds were extended so the first-to-second transition has a longer build and the second screen holds before the laptop transition begins.
- Scroll recording: `tmp/home-scroll-recording/home-scroll-current.mp4`, captured at the current in-app browser viewport (`1470x716`).
- Video QA follow-up fixes:
  - First-to-second transition now delays the second-screen text/ring reveal so it does not collide with the hero headline.
  - Laptop final state now shifts high enough to keep the full computer visible in the shorter current browser viewport.
- Orbit follow-up: `tmp/home-scroll-recording/home-scroll-orbit-current.mp4` confirms the three halo orbs are scroll-driven around the ring during the second-screen hold instead of staying fixed in one triangular arrangement.
- Learning-content follow-up:
  - Screen 2 now carries lightweight platform-specific learning state: course context, study memory, and next practice cards.
  - The second-screen center copy now reads as a learning loop rather than a generic design-practice label.
  - Browser QA at `1470x716` confirmed `secondContentOpacity = 1` during the second-screen hold, returns to `0` in the laptop state, and still has no horizontal overflow.
  - Scroll recording: `tmp/home-scroll-recording/home-scroll-learning-content-current.mp4`.
- Footer follow-up:
  - Added a fourth full-screen footer state after the laptop screen, using a midnight teal / ink blue palette instead of the Marimba olive-green reference.
  - Footer copy and calls to action are learning-platform specific: open learning, course store, workspace, course context, study memory, and next practice.
  - The third-to-footer transition uses an in-place dark veil fade so the laptop fades out while the footer content rises in, avoiding a hard page-edge cut.
  - In-app browser QA at `1280x720` confirmed `footerProgress = 1`, `footerReveal = 1`, `laptopOpacity = 0`, light navigation color, and no horizontal overflow in the final footer state.
  - Transition capture confirmed a blended state with `footerProgress ≈ 0.41` and `laptopOpacity ≈ 0.59`.
  - Screenshots: `tmp/home-scroll-recording/home-footer-iab.png` and `tmp/home-scroll-recording/home-footer-transition-iab.png`.
- Footer refinement:
  - Slowed the laptop entrance by extending the laptop reveal range from `0.72-0.84` to `0.68-0.88`, so the computer rises across a longer scroll distance before the footer starts.
  - Added footer support chips for `中文界面`, `English UI`, `Light theme`, and `Dark theme`.
  - Browser metrics at `1280x720` confirmed the footer support row fits above the actions, no horizontal overflow, and laptop checkpoints progress gradually: `0.76 -> 0.352`, `0.82 -> 0.784`, `0.88 -> 1.000`.
- Laptop scale refinement:
  - Increased the third-screen laptop footprint from `min(108vw, 164vh, 1960px)` to `min(112vw, 176vh, 1880px)` and shifted its final Y target from `248vh` to `256vh`.
  - Browser metrics at `1280x720` confirmed the laptop final state now fills `99%` of the viewport width and height, lands at `y = 4.7`, `bottom = 717.9`, and still has no horizontal overflow.
  - A transition-frame check at scroll progress `0.82` confirmed the laptop is already `93%` viewport width with `0.784` opacity while still rising from the bottom, so the larger final state does not arrive as a hard jump.
- Laptop-to-footer dwell refinement:
  - Extended the sticky homepage scroll height from `820vh` to `940vh` and delayed the footer transition from `0.91-1` to `0.955-1`.
  - Browser metrics at `1280x720` confirmed the laptop is fully settled at progress `0.88`, remains unchanged through progress `0.93`, and still has `footerProgress = 0` at `0.955`; the footer now starts only after roughly `454px` of additional scroll from the laptop final state.
- Second-screen compression refinement:
  - Compressed the second-to-laptop transition from `0.68-0.88` to `0.62-0.80`, reducing the second-screen hold from `22%` to `16%` and its exit transition from `20%` to `18%`.
  - Browser metrics at `1280x720` confirmed the laptop is fully settled by progress `0.80` and remains unchanged until `0.955`, increasing the complete laptop dwell from roughly `454px` to roughly `938px`.
- First-to-second compression refinement:
  - Compressed the first-to-second transition from `0.12-0.46` to `0.12-0.40` and moved the second-to-laptop transition earlier from `0.62-0.80` to `0.56-0.74`.
  - Aligned the second-screen content reveal with the compressed transition by moving its range from `0.30-0.46` to `0.24-0.40`.
  - Browser metrics confirmed the second screen is fully visible at progress `0.40`, the laptop is fully settled by `0.74`, and the complete laptop dwell now runs from `0.74` to `0.955`.
- Hero kicker refinement:
  - Replaced `AI course learning` with `Course learning workspace` so the first-screen pill reads as a course-learning entry rather than an AI-powered badge.
  - Added a soft mint / lavender / peach gradient background to the pill while keeping the text and icon in the homepage teal.
- Header replacement:
  - Replaced the homepage-only `HomeNav` with the existing shared `AppGlobalHeader`, so the landing page now uses the same course context, store, chat, menu, and profile header as the rest of the app.
  - Removed the old homepage nav color-sync CSS and motion variable writes that only existed for the custom Marimba-style header.
- Homepage header controls:
  - Added homepage-only language controls (`中` / `EN`) to the shared header, wired to the existing `useI18n` locale state.
  - Added homepage-only theme controls (`浅` / `深`) to the shared header, wired to the existing `useTheme` light/dark state.
- Headline inline media:
  - Added two inline rounded media cuts inside the first-screen headline, now using white-background Live2D companion avatar portraits rather than UI screenshots.
  - Reworked the existing `syntara-headline-orb` style into clean white image-filled pill cuts with soft highlight, border, and bobbing motion.

Known follow-up:
- The laptop image is recolored to fit the new palette, but it still uses the earlier generated laptop composition. If we want maximum fidelity to Annotated Thinking, the laptop asset should be regenerated in the same cool annotated-learning style.
