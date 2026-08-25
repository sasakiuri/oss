// SPDX-License-Identifier: MIT

interface FiringPointMapping {
  laneAlias: string;
  firingPointNumber: number;
  preferredFiringPointNumber: number | null;
}

/**
 * Assigns the Director-local firing-point number for each Lane.
 *
 * Mappings stay stable while a Lane keeps the same alias, but are rebuilt when
 * the alias changes. This is important because Lane publishes its alias through
 * hardware/state and the value can change while Director is running.
 */
export class FiringPointNumberResolver {
  private readonly mappingByLaneId = new Map<string, FiringPointMapping>();
  private readonly laneIdByFiringPointNumber = new Map<number, string>();

  resolve(laneId: string, laneAlias: string): number | null {
    const preferredFiringPointNumber = this.getPreferredFiringPointNumber(laneAlias);
    const mapped = this.mappingByLaneId.get(laneId);
    if (mapped?.laneAlias === laneAlias) {
      if (preferredFiringPointNumber === null || mapped.firingPointNumber === preferredFiringPointNumber) {
        return mapped.firingPointNumber;
      }

      const preferredOwner = this.laneIdByFiringPointNumber.get(preferredFiringPointNumber);
      if (preferredOwner !== undefined && preferredOwner !== laneId) {
        const preferredOwnerMapping = this.mappingByLaneId.get(preferredOwner);
        if (preferredOwnerMapping?.preferredFiringPointNumber === preferredFiringPointNumber) {
          return mapped.firingPointNumber;
        }
      }
    }

    if (mapped) {
      this.release(laneId);
    }

    let firingPointNumber = preferredFiringPointNumber;
    if (firingPointNumber !== null) {
      const currentOwner = this.laneIdByFiringPointNumber.get(firingPointNumber);
      if (currentOwner !== undefined) {
        const currentOwnerMapping = this.mappingByLaneId.get(currentOwner);
        if (currentOwnerMapping?.preferredFiringPointNumber === firingPointNumber) {
          firingPointNumber = null;
        } else {
          // Alias-derived numbers take precedence over numbers assigned only as
          // a fallback. The displaced Lane is assigned another free number the
          // next time it is resolved.
          this.release(currentOwner);
        }
      }
    }

    if (firingPointNumber === null) {
      for (let candidate = 1; candidate <= 99; candidate += 1) {
        if (!this.laneIdByFiringPointNumber.has(candidate)) {
          firingPointNumber = candidate;
          break;
        }
      }
    }
    if (firingPointNumber === null) return null;

    this.mappingByLaneId.set(laneId, {
      laneAlias,
      firingPointNumber,
      preferredFiringPointNumber,
    });
    this.laneIdByFiringPointNumber.set(firingPointNumber, laneId);
    return firingPointNumber;
  }

  private getPreferredFiringPointNumber(laneAlias: string): number | null {
    const aliasNumber = Number(laneAlias.match(/\d+/)?.[0]);
    return Number.isInteger(aliasNumber) && aliasNumber >= 1 && aliasNumber <= 99 ? aliasNumber : null;
  }

  private release(laneId: string): void {
    const mapped = this.mappingByLaneId.get(laneId);
    if (!mapped) return;
    if (this.laneIdByFiringPointNumber.get(mapped.firingPointNumber) === laneId) {
      this.laneIdByFiringPointNumber.delete(mapped.firingPointNumber);
    }
    this.mappingByLaneId.delete(laneId);
  }

  forget(laneId: string): void {
    this.release(laneId);
  }

  reset(): void {
    this.mappingByLaneId.clear();
    this.laneIdByFiringPointNumber.clear();
  }
}
