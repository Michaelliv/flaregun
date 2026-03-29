/**
 * Rotation strategies for distributing requests across workers.
 */

import type { RotationStrategy, WorkerInfo } from "../types.js";

export interface Rotator {
  next(): WorkerInfo;
  markError(worker: WorkerInfo): void;
  reset(): void;
}

class RoundRobinRotator implements Rotator {
  private index = 0;
  constructor(private workers: WorkerInfo[]) {}

  next(): WorkerInfo {
    const worker = this.workers[this.index % this.workers.length];
    this.index++;
    return worker;
  }

  markError(_worker: WorkerInfo): void {
    // Round-robin doesn't adapt
  }

  reset(): void {
    this.index = 0;
  }
}

class RandomRotator implements Rotator {
  constructor(private workers: WorkerInfo[]) {}

  next(): WorkerInfo {
    const idx = Math.floor(Math.random() * this.workers.length);
    return this.workers[idx];
  }

  markError(_worker: WorkerInfo): void {}
  reset(): void {}
}

class AdaptiveRotator implements Rotator {
  private errors: Map<string, number> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private index = 0;

  constructor(private workers: WorkerInfo[]) {}

  next(): WorkerInfo {
    const now = Date.now();
    // Try up to N times to find a non-cooled-down worker
    for (let attempt = 0; attempt < this.workers.length; attempt++) {
      const worker = this.workers[this.index % this.workers.length];
      this.index++;

      const cooldownUntil = this.cooldowns.get(worker.name) ?? 0;
      if (now >= cooldownUntil) {
        return worker;
      }
    }

    // All workers cooling down — just return the next one anyway
    const worker = this.workers[this.index % this.workers.length];
    this.index++;
    return worker;
  }

  markError(worker: WorkerInfo): void {
    const count = (this.errors.get(worker.name) ?? 0) + 1;
    this.errors.set(worker.name, count);

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const backoffMs = Math.min(1000 * 2 ** (count - 1), 30_000);
    this.cooldowns.set(worker.name, Date.now() + backoffMs);
  }

  reset(): void {
    this.errors.clear();
    this.cooldowns.clear();
    this.index = 0;
  }
}

export function createRotator(
  strategy: RotationStrategy,
  workers: WorkerInfo[],
): Rotator {
  if (workers.length === 0) {
    throw new Error("No workers available for rotation");
  }

  switch (strategy) {
    case "round-robin":
      return new RoundRobinRotator(workers);
    case "random":
      return new RandomRotator(workers);
    case "adaptive":
      return new AdaptiveRotator(workers);
    default:
      throw new Error(`Unknown rotation strategy: ${strategy}`);
  }
}
