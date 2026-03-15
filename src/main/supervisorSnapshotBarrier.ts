export type SupervisorSnapshotBarrier = {
  hasReceivedSnapshot: boolean;
  waiters: Set<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: NodeJS.Timeout;
  }>;
};

export function createSupervisorSnapshotBarrier(): SupervisorSnapshotBarrier {
  return {
    hasReceivedSnapshot: false,
    waiters: new Set()
  };
}

export function markSupervisorSnapshotReceived(barrier: SupervisorSnapshotBarrier): void {
  barrier.hasReceivedSnapshot = true;
  for (const waiter of barrier.waiters) {
    clearTimeout(waiter.timeoutId);
    waiter.resolve();
  }
  barrier.waiters.clear();
}

export async function waitForSupervisorSnapshot(barrier: SupervisorSnapshotBarrier, timeoutMs: number): Promise<void> {
  if (barrier.hasReceivedSnapshot) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const waiter = {
      resolve: () => {
        barrier.waiters.delete(waiter);
        resolve();
      },
      reject: (error: Error) => {
        barrier.waiters.delete(waiter);
        reject(error);
      },
      timeoutId: setTimeout(() => {
        waiter.reject(new Error(`Supervisor snapshot timed out after ${timeoutMs}ms`));
      }, timeoutMs)
    };
    barrier.waiters.add(waiter);
  });
}
