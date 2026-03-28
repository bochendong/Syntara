# Startup Modes

## Goal

Help the user choose how Syntara should run before you start anything.

## Options

### 1. Development Mode

Recommended for first-time setup and debugging.

```bash
pnpm dev
```

Tradeoff:

- Fastest feedback loop
- Best for validating config changes
- Not representative of production startup

### 2. Production-Like Local Mode

Recommended when the user wants behavior closer to a deployed server.

```bash
pnpm build && pnpm start
```

Tradeoff:

- Closer to production
- Slower startup than `pnpm dev`

## Recommendation Order

1. `pnpm dev`
2. `pnpm build && pnpm start`

## Health Check

After startup, verify:

```bash
curl -fsS http://localhost:3000/api/health
```

If the skill config provides a custom `url`, use that instead.

## Confirmation Requirements

- Ask the user to choose one startup mode.
- Ask again before running the selected command.
