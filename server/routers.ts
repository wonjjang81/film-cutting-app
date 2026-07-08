import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, adminProcedure, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { guestAccounts, sessions, accessCodes, users } from "@/drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
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
    validateAccessCode: publicProcedure
      .input(
        z.object({
          code: z.string().min(1).max(32),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }

        try {
          // Find access code
          const result = await db
            .select()
            .from(accessCodes)
            .where(eq(accessCodes.code, input.code))
            .limit(1);

          if (result.length === 0) {
            return {
              valid: false,
              message: "유효하지 않은 접속코드입니다.",
            };
          }

          const accessCode = result[0];

          // Check if code is active
          if (accessCode.isActive === 0) {
            return {
              valid: false,
              message: "비활성화된 접속코드입니다.",
            };
          }

          // Check if code has expired
          if (accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) {
            return {
              valid: false,
              message: "만료된 접속코드입니다.",
            };
          }

          // Check usage limit
          if (accessCode.usageLimit && accessCode.usageCount >= accessCode.usageLimit) {
            return {
              valid: false,
              message: "사용 횟수를 초과한 접속코드입니다.",
            };
          }

          // Increment usage count
          await db
            .update(accessCodes)
            .set({ usageCount: (accessCode.usageCount || 0) + 1 })
            .where(eq(accessCodes.id, accessCode.id));

          return {
            valid: true,
            message: "접속코드가 유효합니다.",
            codeId: accessCode.id,
          };
        } catch (error) {
          console.error("[Auth] Access code validation failed:", error);
          throw new Error("Failed to validate access code");
        }
      }),
    guestLogin: publicProcedure
      .input(
        z.object({
          durationMinutes: z.number().min(1).max(10080), // max 7 days
          deviceId: z.string().min(1),
          accessCodeId: z.number().optional(), // Optional: link to access code
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

  admin: router({
    // Create a new access code (admin only)
    createAccessCode: adminProcedure
      .input(
        z.object({
          code: z.string().min(6).max(32),
          usageLimit: z.number().int().positive().optional(),
          expiresAt: z.string().datetime().optional(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }

        try {
          // Check if code already exists
          const existing = await db
            .select()
            .from(accessCodes)
            .where(eq(accessCodes.code, input.code))
            .limit(1);

          if (existing.length > 0) {
            throw new Error("이미 존재하는 접속코드입니다.");
          }

          // Create new access code
          const result = await db.insert(accessCodes).values({
            code: input.code,
            isActive: 1,
            usageLimit: input.usageLimit || null,
            usageCount: 0,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            createdBy: ctx.user?.email || ctx.user?.name || "unknown",
            notes: input.notes || null,
          });

          return {
            success: true,
            codeId: (result as any).insertId,
            message: "접속코드가 생성되었습니다.",
          };
        } catch (error) {
          console.error("[Admin] Create access code failed:", error);
          throw new Error(
            error instanceof Error ? error.message : "Failed to create access code"
          );
        }
      }),

    // List all access codes (admin only)
    listAccessCodes: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      try {
        const codes = await db
          .select()
          .from(accessCodes)
          .orderBy(desc(accessCodes.createdAt));

        return codes.map((code) => ({
          id: code.id,
          code: code.code,
          isActive: code.isActive === 1,
          usageLimit: code.usageLimit,
          usageCount: code.usageCount,
          expiresAt: code.expiresAt?.toISOString() || null,
          createdAt: code.createdAt?.toISOString() || null,
          createdBy: code.createdBy,
          notes: code.notes,
        }));
      } catch (error) {
        console.error("[Admin] List access codes failed:", error);
        throw new Error("Failed to list access codes");
      }
    }),

    // Update access code status (admin only)
    updateAccessCode: adminProcedure
      .input(
        z.object({
          codeId: z.number().int().positive(),
          isActive: z.boolean().optional(),
          usageLimit: z.number().int().positive().optional(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }

        try {
          const updateData: Record<string, any> = {};

          if (input.isActive !== undefined) {
            updateData.isActive = input.isActive ? 1 : 0;
          }
          if (input.usageLimit !== undefined) {
            updateData.usageLimit = input.usageLimit;
          }
          if (input.notes !== undefined) {
            updateData.notes = input.notes;
          }

          if (Object.keys(updateData).length === 0) {
            throw new Error("업데이트할 내용이 없습니다.");
          }

          await db
            .update(accessCodes)
            .set(updateData)
            .where(eq(accessCodes.id, input.codeId));

          return {
            success: true,
            message: "접속코드가 업데이트되었습니다.",
          };
        } catch (error) {
          console.error("[Admin] Update access code failed:", error);
          throw new Error(
            error instanceof Error ? error.message : "Failed to update access code"
          );
        }
      }),

    // Delete access code (admin only)
    deleteAccessCode: adminProcedure
      .input(
        z.object({
          codeId: z.number().int().positive(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }

        try {
          await db.delete(accessCodes).where(eq(accessCodes.id, input.codeId));

          return {
            success: true,
            message: "접속코드가 삭제되었습니다.",
          };
        } catch (error) {
          console.error("[Admin] Delete access code failed:", error);
          throw new Error("Failed to delete access code");
        }
      }),

    // Get admin statistics (admin only)
    getStatistics: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      try {
        // Get total codes
        const totalCodes = await db.select().from(accessCodes);
        const activeCodes = totalCodes.filter((c) => c.isActive === 1);
        const totalUsage = totalCodes.reduce((sum, c) => sum + (c.usageCount || 0), 0);

        // Get active guest sessions
        const now = new Date();
        const activeSessions = await db
          .select()
          .from(sessions)
          .where(and(eq(sessions.isActive, 1), gte(sessions.expiresAt, now)));

        // Get total users
        const totalUsers = await db.select().from(users);

        return {
          totalAccessCodes: totalCodes.length,
          activeAccessCodes: activeCodes.length,
          totalUsage,
          activeSessions: activeSessions.length,
          totalUsers: totalUsers.length,
        };
      } catch (error) {
        console.error("[Admin] Get statistics failed:", error);
        throw new Error("Failed to get statistics");
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
