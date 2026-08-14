import { Pool } from "pg"

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres.pvdumvhgnnfdxsijslmz:Xinora088258@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

const cleanUrl = connectionString.replace(/\?.*$/, "")

let globalPool: Pool | null = null

export function getPgPool(): Pool {
  if (!globalPool) {
    globalPool = new Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  }
  return globalPool
}

export async function queryPg<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const p = getPgPool()
  return p.query(text, params)
}
