// SPDX-License-Identifier: MIT
import { ConnectToTargetToken } from '@/main/composition/tokens';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { IAppSettingsStore } from '@/main/modules/settings/application/IAppSettingsStore';
import {
  findTargetDeviceDefinition,
  isBpt216DeviceId,
  isDisagRedDotDeviceId,
} from '@/main/modules/target/domain/targetDeviceDefinitions';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { resolveAutoConnectSettings } from '@/main/resolveAutoConnectSettings';
import { CommandBus } from '@/main/shared-infra/cqrs';
import { getLogger } from '@/main/shared-infra/logging';

export function scheduleAutoConnect(
  settingsStore: IAppSettingsStore,
  usbManager: Pick<IUSBConnectionManager, 'listPorts'>,
  commandBus: CommandBus,
  firstSessionStarted: Promise<void>,
): void {
  void (async () => {
    const logger = getLogger();
    let settings = settingsStore.getConnectionSettings();

    if (!settings) {
      logger.info('Auto-connect: no saved connection settings found, skipping.', 'main');
      return;
    }

    try {
      const ports = await usbManager.listPorts();
      const resolvedSettings = resolveAutoConnectSettings(settings, ports);

      if (!resolvedSettings) {
        if (ports.length === 0) {
          logger.warn('Auto-connect: current port scan returned no ports, falling back to saved port.', 'main', {
            savedPortName: settings.portName,
          });
        } else {
          logger.warn('Auto-connect: saved device could not be resolved among current ports, skipping.', 'main', {
            savedPortName: settings.portName,
            serialNumber: settings.serialNumber,
            vendorId: settings.vendorId,
            productId: settings.productId,
          });
          return;
        }
      } else if (resolvedSettings.shouldPersist) {
        const previousPortName = settings.portName;
        settings = resolvedSettings.settings;
        settingsStore.saveConnectionSettings(settings);
        logger.info('Auto-connect: refreshed saved device settings from current ports.', 'main', {
          previousPortName,
          resolvedPortName: resolvedSettings.settings.portName,
          matchedBy: resolvedSettings.resolvedPort.matchedBy,
          identityUpdated: resolvedSettings.identityUpdated,
        });
      } else {
        settings = resolvedSettings.settings;
      }
    } catch (err) {
      logger.warn('Auto-connect: failed to inspect current ports, falling back to saved port.', 'main', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let manufacturer: TargetManufacturer;
    try {
      manufacturer = TargetManufacturer.fromValue(settings.manufacturer);
    } catch (err) {
      logger.warn('Auto-connect: invalid manufacturer in saved settings, skipping.', 'main', {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (isBpt216DeviceId(settings.deviceId) || isDisagRedDotDeviceId(settings.deviceId)) {
      logger.info('Auto-connect: waiting for the initial session before connecting the selected target.', 'main', {
        deviceId: settings.deviceId,
      });
      await firstSessionStarted;
    }

    logger.info(`Auto-connect: attempting connection to ${settings.portName} (${settings.manufacturer})`, 'main');

    const baudRate = findTargetDeviceDefinition(settings.deviceId)?.serialConfig.baudRate;

    commandBus
      .execute(ConnectToTargetToken, {
        portName: settings.portName,
        manufacturer,
        deviceId: settings.deviceId,
        baudRate,
      })
      .then(() => {
        logger.info('Auto-connect: connection established successfully.', 'main');
      })
      .catch((err: unknown) => {
        logger.warn('Auto-connect: connection failed, manual connection required.', 'main', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  })();
}
