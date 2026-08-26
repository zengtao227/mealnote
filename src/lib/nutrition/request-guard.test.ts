import { describe, expect, it } from "vitest";
import {
  RequestRevisionGuard,
  type RequestRevisionToken,
} from "@/lib/nutrition/request-guard";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise: Promise<T> = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function applyDeferredIfCurrent<T>(
  guard: RequestRevisionGuard,
  token: RequestRevisionToken,
  pending: Promise<T>,
  apply: (value: T) => void,
): Promise<void> {
  const value: T = await pending;
  if (guard.isCurrent(token)) {
    apply(value);
  }
}

describe("RequestRevisionGuard", () => {
  it("drops a deferred calculation response after an edit invalidates the review", async () => {
    const guard = new RequestRevisionGuard();
    const token = guard.begin();
    const response = deferred<number>();
    let committed: number | undefined;
    const pendingCommit = applyDeferredIfCurrent(guard, token, response.promise, (value) => {
      committed = value;
    });

    guard.invalidate(); // item edit
    response.resolve(116);
    await pendingCommit;

    expect(token.signal.aborted).toBe(true);
    expect(committed).toBeUndefined();
  });

  it("drops a deferred calculation response after an item removal invalidates the review", async () => {
    const guard = new RequestRevisionGuard();
    const token = guard.begin();
    const response = deferred<string[]>();
    let committed: string[] | undefined;
    const pendingCommit = applyDeferredIfCurrent(guard, token, response.promise, (value) => {
      committed = value;
    });

    guard.invalidate(); // item removal
    response.resolve(["米饭", "饺子"]);
    await pendingCommit;

    expect(committed).toBeUndefined();
  });

  it("accepts the latest response and rejects a superseded request", () => {
    const guard = new RequestRevisionGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(first.signal.aborted).toBe(true);
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    expect(guard.finish(second)).toBe(true);
    expect(guard.finish(first)).toBe(false);
  });
});
