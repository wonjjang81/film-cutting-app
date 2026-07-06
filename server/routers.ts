import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { guestAccounts, sessions } from "../drizzle/schema";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    guestLogin: publicProcedure
      .input(
        z.object({
          durationMinutes: z.number().min(1).max(10080), // max 7 days
          deviceId: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }

        try {
          // Create guest account
          const expiresAt = new Date(Date.now() + input.durationMinutes * 60 * 1000);
          const guestToken = uuidv4();

          const result = await db.insert(guestAccounts).values({
            guestToken,
            expiresAt,
          });

          const guestAccountId = (result as any).insertId;

          // Create tokens
          const accessTokenJti = uuidv4();
          const refreshTokenJti = uuidv4();
          const secret = process.env.JWT_SECRET || "dev-secret";

          const accessToken = jwt.sign(
            { sub: `guest_${guestAccountId}`, type: "guest", jti: accessTokenJti },
            secret,
            { expiresIn: "1h" }
          );

          const refreshToken = jwt.sign(
            { sub: `guest_${guestAccountId}`, type: "guest", jti: refreshTokenJti },
            secret,
            { expiresIn: `${input.durationMinutes}m` }
          );

          // Create session
          await db.insert(sessions).values({
            guestAccountId,
            deviceId: input.deviceId,
            accessTokenJti,
            refreshTokenJti,
            expiresAt,
            isActive: 1,
          });

          return {
            accessToken,
            refreshToken,
            expiresAt: expiresAt.toISOString(),
            guestAccountId,
          };
        } catch (error) {
          console.error("[Auth] Guest login failed:", error);
          throw new Error("Failed to create guest account");
        }
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
