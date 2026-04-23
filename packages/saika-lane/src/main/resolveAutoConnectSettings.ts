// SPDX-License-Identifier: MIT
import type { ConnectionSettingsDto, PortInfo } from '@/shared/ipc/contracts';
import {
  resolveSavedConnectionPort,
  type SavedConnectionPortResolution,
} from '@/shared/settings/resolveSavedConnectionPort';

export interface AutoConnectSettingsResolution {
  settings: ConnectionSettingsDto;
  resolvedPort: SavedConnectionPortResolution;
  portNameChanged: boolean;
  identityUpdated: boolean;
  shouldPersist: boolean;
}

function normalizeOptionalIdentifier(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function mergeOptionalIdentifier(savedValue: string | undefined, currentValue: string | undefined): string | undefined {
  return normalizeOptionalIdentifier(currentValue) ?? normalizeOptionalIdentifier(savedValue);
}

function identifiersDiffer(savedValue: string | undefined, currentValue: string | undefined): boolean {
  return normalizeOptionalIdentifier(savedValue) !== normalizeOptionalIdentifier(currentValue);
}

export function resolveAutoConnectSettings(
  settings: ConnectionSettingsDto,
  ports: PortInfo[],
): AutoConnectSettingsResolution | null {
  const resolvedPort = resolveSavedConnectionPort(settings, ports);
  if (!resolvedPort) {
    return null;
  }

  const matchedPort = ports.find((port) => port.path === resolvedPort.portName);
  const nextSerialNumber = mergeOptionalIdentifier(settings.serialNumber, matchedPort?.serialNumber);
  const nextVendorId = mergeOptionalIdentifier(settings.vendorId, matchedPort?.vendorId);
  const nextProductId = mergeOptionalIdentifier(settings.productId, matchedPort?.productId);

  const nextSettings: ConnectionSettingsDto = {
    portName: resolvedPort.portName,
    manufacturer: settings.manufacturer,
    ...(settings.deviceId ? { deviceId: settings.deviceId } : {}),
    ...(nextSerialNumber ? { serialNumber: nextSerialNumber } : {}),
    ...(nextVendorId ? { vendorId: nextVendorId } : {}),
    ...(nextProductId ? { productId: nextProductId } : {}),
  };

  const portNameChanged = resolvedPort.portName !== settings.portName;
  const identityUpdated =
    identifiersDiffer(settings.serialNumber, nextSerialNumber) ||
    identifiersDiffer(settings.vendorId, nextVendorId) ||
    identifiersDiffer(settings.productId, nextProductId);

  return {
    settings: nextSettings,
    resolvedPort,
    portNameChanged,
    identityUpdated,
    shouldPersist: portNameChanged || identityUpdated,
  };
}
