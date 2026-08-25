/**
 * Domain Events barrel export
 *
 * Re-exports domain events through each module's public API.
 */

// Side-effect import to ensure core module augmentations are included
import '@/main/shared-infra/events/coreEvents';

// Re-export base types from EventBus (EventRegistry, EventName, EventMap remain here)
export type { EventName, EventMap, EventRegistry } from '@/main/shared-infra/events/EventBus';

// Re-export base types from new locations
export type { DomainEvent } from '@/main/shared-infra/events/EventBus';
export type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';

// Re-export core events
export type { CompetitionStarted, PhaseChanged, TimerTick, TimerExpired } from '@/main/shared-infra/events/coreEvents';

// Re-export mqtt events
export type {
  ShotReceived,
  LaneConnected,
  DebugLogEmitted,
  MqttConnectionError,
  MqttControlStateChanged,
} from '@/main/modules/mqtt';

// Re-export lane-control events
export type {
  LanePhaseChanged,
  LaneTimerTick,
  LaneTimerExpired,
  LaneControlUpdated,
  ShotAdded,
  ShotEdited,
  ShotDeleted,
  ShotInserted,
  LaneMoved,
} from '@/main/modules/lane-control';

// Re-export shootoff events
export type {
  ShootoffStarted,
  ShootoffShotAdded,
  ShootoffRoundCompleted,
  ShootoffResolved,
} from '@/main/modules/shootoff';
