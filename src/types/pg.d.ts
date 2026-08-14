declare module "pg" {
  export class Pool {
    constructor(config?: any);
    query<T = any>(text: string, values?: any[]): Promise<{ rows: T[] }>;
    connect(): Promise<any>;
    end(): Promise<void>;
  }
  export class Client {
    constructor(config?: any);
    connect(): Promise<void>;
    query<T = any>(text: string, values?: any[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
