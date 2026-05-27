import { PrismaClient, CreditTransactionKind } from '@prisma/client';

const TARGET_CREDITS = 500;
const shouldCommit = process.argv.includes('--commit');

const prisma = new PrismaClient();

async function ensureLedgerInitialized(tx, userId) {
  const [user, existingTransactions] = await Promise.all([
    tx.user.findUnique({
      where: { id: userId },
      select: { creditsBalance: true },
    }),
    tx.creditTransaction.count({
      where: { userId },
    }),
  ]);

  if (!user) return null;
  if (existingTransactions > 0) return user.creditsBalance;

  await tx.creditTransaction.create({
    data: {
      userId,
      kind: CreditTransactionKind.WELCOME_BONUS,
      delta: 0,
      balanceAfter: user.creditsBalance,
      description: 'Credits ledger initialized before 500-credit backfill',
      referenceType: 'credits_backfill_init',
      referenceId: 'welcome-500-backfill',
      metadata: {
        targetCredits: TARGET_CREDITS,
      },
    },
  });

  return user.creditsBalance;
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      creditsBalance: {
        lt: TARGET_CREDITS,
      },
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      creditsBalance: true,
      createdAt: true,
    },
  });

  const preview = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    balanceBefore: user.creditsBalance,
    delta: TARGET_CREDITS - user.creditsBalance,
    balanceAfter: TARGET_CREDITS,
  }));

  const totalDelta = preview.reduce((sum, row) => sum + row.delta, 0);

  console.log(`Found ${preview.length} users below ${TARGET_CREDITS} credits.`);
  if (preview.length > 0) {
    console.table(preview.slice(0, 20));
    if (preview.length > 20) {
      console.log(`...and ${preview.length - 20} more users.`);
    }
  }
  console.log(`Total credits to grant: ${totalDelta}`);

  if (!shouldCommit) {
    console.log('');
    console.log('Dry run only. Re-run with --commit to apply the backfill.');
    return;
  }

  let updatedUsers = 0;
  let grantedCredits = 0;

  for (const user of users) {
    const delta = TARGET_CREDITS - user.creditsBalance;
    if (delta <= 0) continue;

    await prisma.$transaction(async (tx) => {
      const currentBalance = await ensureLedgerInitialized(tx, user.id);
      if (currentBalance == null) return;

      const freshDelta = TARGET_CREDITS - currentBalance;
      if (freshDelta <= 0) return;

      const nextBalance = currentBalance + freshDelta;

      await tx.user.update({
        where: { id: user.id },
        data: { creditsBalance: nextBalance },
      });

      await tx.creditTransaction.create({
        data: {
          userId: user.id,
          kind: CreditTransactionKind.WELCOME_BONUS,
          delta: freshDelta,
          balanceAfter: nextBalance,
          description: `One-time backfill to ${TARGET_CREDITS} welcome credits`,
          referenceType: 'credits_backfill',
          referenceId: 'welcome-500-backfill',
          metadata: {
            targetCredits: TARGET_CREDITS,
            balanceBefore: currentBalance,
            balanceAfter: nextBalance,
          },
        },
      });
    });

    updatedUsers += 1;
    grantedCredits += delta;
  }

  console.log('');
  console.log(`Backfill complete. Updated ${updatedUsers} users.`);
  console.log(`Granted ${grantedCredits} credits in total.`);
}

main()
  .catch((error) => {
    const code = error?.code;
    const message = error instanceof Error ? error.message : String(error);

    if (code === 'P2022' || message.includes('creditsBalance')) {
      console.error('Backfill failed: credits schema is not applied in the current database yet.');
      console.error('Run the credits migration first, for example:');
      console.error('  npx prisma migrate dev --name add-credits-system');
      console.error('Then re-run:');
      console.error('  pnpm credits:backfill-500');
      console.error('  pnpm credits:backfill-500 --commit');
    } else if (message.includes('DATABASE_URL')) {
      console.error('Backfill failed: DATABASE_URL is missing.');
      console.error('Run through the package script so .env.local is loaded:');
      console.error('  pnpm credits:backfill-500');
    } else {
      console.error('Backfill failed:', error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
