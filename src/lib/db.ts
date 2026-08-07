import { PrismaClient } from "@prisma/client"
import mysql from "mysql2/promise"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db

// Direct mysql2 Connection Pool (reads DATABASE_URL if direct raw queries are needed)
export const pool = mysql.createPool(
  process.env.DATABASE_URL || "mysql://root:@localhost:3306/nota_photo"
)
