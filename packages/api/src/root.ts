/** The merged EvenUp tRPC application router. */
import { router } from './trpc.js';
import { groupRouter } from './routers/group.js';
import { memberRouter } from './routers/member.js';
import { transactionRouter } from './routers/transaction.js';
import { balanceRouter } from './routers/balance.js';
import { settlementRouter } from './routers/settlement.js';
import { inviteRouter } from './routers/invite.js';
import { userRouter } from './routers/user.js';
import { ocrRouter } from './routers/ocr.js';
import { fxRouter } from './routers/fx.js';
import { statsRouter } from './routers/stats.js';
import { activityRouter } from './routers/activity.js';
import { adminRouter } from './routers/admin.js';

export const appRouter = router({
  group: groupRouter,
  member: memberRouter,
  transaction: transactionRouter,
  balance: balanceRouter,
  settlement: settlementRouter,
  invite: inviteRouter,
  user: userRouter,
  ocr: ocrRouter,
  fx: fxRouter,
  stats: statsRouter,
  activity: activityRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
