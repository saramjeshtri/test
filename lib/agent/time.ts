/** Rejects if `promise` takes longer than `ms`. The work behind it is not cancelled, only no longer waited for. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
