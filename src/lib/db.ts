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

// Direct mysql2 Connection Pool (useful if querying directly without ORM)
export const pool = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "",
  database: "nota_photo",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})
