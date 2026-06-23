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

Known follow-up:
- The laptop image is recolored to fit the new palette, but it still uses the earlier generated laptop composition. If we want maximum fidelity to Annotated Thinking, the laptop asset should be regenerated in the same cool annotated-learning style.
