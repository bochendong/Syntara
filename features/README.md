# Feature Domains

This directory is the product-domain boundary for Syntara. New code should enter through a feature domain instead of reaching across `app`, `components`, `lib`, and `server` directly.

- `ppt-generation`: notebook/PPT creation pipelines, generation APIs, and generation QA.
- `ppt-playback`: classroom playback, slide narration, rendering, and stage interaction.
- `problems`: problem schema, import, bank editing, and server persistence.
- `practice`: answering questions, grading, code execution, and attempt feedback.
- `chat`: chat sessions, streaming, course side chat, and chat protocol types.
- `review`: review routes, maps, route progress, and problem-bank readiness.
- `memory`: study memory, private memory, and companion nudges.
- `notifications`: notification models, feeds, banners, and notification operations.

During migration, each feature can re-export old modules as a facade. The important rule is that new or touched feature work should import from `features/<domain>` first, then old `lib/*` paths can be retired gradually.

QA implementations should follow the same domain boundary. Keep public route shells under `app/(qa)` and place large QA clients, panels, fixtures, and helpers under the owning feature's `qa` directory.
