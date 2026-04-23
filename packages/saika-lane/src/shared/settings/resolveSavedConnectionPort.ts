// SPDX-License-Identifier: MIT
import type { ConnectionSettingsDto, PortInfo } from '@/shared/ipc/contracts';

export interface SavedConnectionPortResolution {
  portName: string;
  matchedBy: 'serialNumber' | 'vendorProduct' | 'portName';
}

function normalizeIdentifier(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function findPortByPath(ports: PortInfo[], portName: string): PortInfo | undefined {
  return ports.find((port) => port.path === portName);
}

function hasConflictingIdentifier(savedValue: string | undefined, currentValue: string | undefined): boolean {
  const normalizedSavedValue = normalizeIdentifier(savedValue);
  const normalizedCurrentValue = normalizeIdentifier(currentValue);

  return (
    normalizedSavedValue !== undefined &&
    normalizedCurrentValue !== undefined &&
    normalizedSavedValue !== normalizedCurrentValue
  );
}

export function resolveSavedConnectionPort(
  settings: Pick<ConnectionSettingsDto, 'portName' | 'serialNumber' | 'vendorId' | 'productId'>,
  ports: PortInfo[],
): SavedConnectionPortResolution | null {
  if (!settings.portName) {
    return null;
  }

  const exactPathMatch = findPortByPath(ports, settings.portName);
  const normalizedSerialNumber = normalizeIdentifier(settings.serialNumber);

  if (normalizedSerialNumber) {
    const serialMatches = ports.filter((port) => normalizeIdentifier(port.serialNumber) === normalizedSerialNumber);

    if (serialMatches.length === 1) {
      return {
        portName: serialMatches[0]!.path,
        matchedBy: 'serialNumber',
      };
    }

    const savedPathSerialMatch = serialMatches.find((port) => port.path === settings.portName);
    if (savedPathSerialMatch) {
      return {
        portName: savedPathSerialMatch.path,
        matchedBy: 'serialNumber',
      };
    }
  }

  const normalizedVendorId = normalizeIdentifier(settings.vendorId);
  const normalizedProductId = normalizeIdentifier(settings.productId);

  if (normalizedVendorId && normalizedProductId) {
    const vendorProductMatches = ports.filter(
      (port) =>
        normalizeIdentifier(port.vendorId) === normalizedVendorId &&
        normalizeIdentifier(port.productId) === normalizedProductId &&
        (normalizedSerialNumber === undefined || normalizeIdentifier(port.serialNumber) === normalizedSerialNumber) &&
        !hasConflictingIdentifier(settings.serialNumber, port.serialNumber),
    );

    if (vendorProductMatches.length === 1) {
      return {
        portName: vendorProductMatches[0]!.path,
        matchedBy: 'vendorProduct',
      };
    }

    const savedPathVendorProductMatch = vendorProductMatches.find((port) => port.path === settings.portName);
    if (savedPathVendorProductMatch) {
      return {
        portName: savedPathVendorProductMatch.path,
        matchedBy: 'vendorProduct',
      };
    }
  }

  const exactPathConflictsWithSavedIdentity =
    exactPathMatch &&
    (hasConflictingIdentifier(settings.serialNumber, exactPathMatch.serialNumber) ||
      hasConflictingIdentifier(settings.vendorId, exactPathMatch.vendorId) ||
      hasConflictingIdentifier(settings.productId, exactPathMatch.productId));

  if (exactPathConflictsWithSavedIdentity) {
    return null;
  }

  if (exactPathMatch) {
    return {
      portName: exactPathMatch.path,
      matchedBy: 'portName',
    };
  }

  return null;
}
