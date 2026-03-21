# ADR-0002: Electron App Architecture

## Status

Accepted

## Date

2025-01-01

## Context

Saika Lane is a desktop application for electronic target hit-point display, serving shooting ranges and competitions. The system must:

- Support multiple target manufacturers (Kohto, SIUS, Meyton, DISAG, custom) with distinct binary protocols and data formats.
- Process shot data in real time over USB serial connections and display impact points with sub-millimeter precision.
- Operate fully offline at the lane level while optionally connecting to a central server via MQTT.
- Handle complex competition state machines (phases, stages, scoring rules) that vary by discipline.
- Remain maintainable as new manufacturers, disciplines, and features are added over time.

A simpler layered architecture was considered but rejected because the diversity of target protocols and the need for strict domain isolation made a more structured approach necessary.

## Decision

We adopt a combination of **Clean Architecture**, **Domain-Driven Design (DDD)**, **CQRS**, **Event-driven architecture**, and **Hexagonal Architecture (Ports & Adapters)**, organized into **feature modules**.

### Module Structure

The main process is composed of feature modules, each containing its own `domain/`, `application/`, and `infra/` layers:

- **session** -- Shot aggregation, scoring, series management.
- **connection** -- USB serial lifecycle, device detection, data pipeline.
- **target** -- Manufacturer-specific protocol parsing and coordinate conversion via adapter pattern.
- **competition** -- State machine (5-phase), timer, discipline rules.
- **mqtt** -- Broker connectivity, command/event publishing, RPC handling.
- **report** -- Score sheet generation, print window management.
- **settings** -- Persistent user/device configuration.

### Cross-Cutting Concerns (shared-infra)

- **CQRS Bus** -- Token-based `CommandBus` and `QueryBus` for inter-module communication.
- **TypedEventBus** -- Strongly-typed event bus for domain events.
- **IpcRouter** -- Contract-driven main-process IPC handler registration.
- **ModuleLoader** -- Declarative module lifecycle management.

### Renderer Architecture

- React 19 with Zustand for state management.
- Service layer wraps IPC calls with unified error handling (`createServiceMethod`).
- Presentation layer uses custom hooks for event subscriptions and async operations.

## Consequences

### Positive

- Each target manufacturer is isolated in its own adapter, enabling addition of new manufacturers without modifying core logic.
- CQRS separates read and write paths, simplifying competition state management and query optimization.
- Feature modules are independently testable with clear boundaries and mockable dependencies.
- The event-driven approach decouples modules (e.g., connection module emits shot events without knowing about session or MQTT modules).
- Domain logic has zero dependency on Electron, enabling unit testing without Electron runtime.

### Negative

- Higher initial complexity and steeper learning curve compared to a flat Electron app structure.
- The module system and CQRS bus introduce indirection that can make request tracing less obvious.
- Requires discipline to maintain layer boundaries (e.g., domain must not import from infra).

## References

- [Clean Architecture (Robert C. Martin)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal Architecture (Alistair Cockburn)](https://alistair.cockburn.us/hexagonal-architecture/)
- [CQRS (Martin Fowler)](https://martinfowler.com/bliki/CQRS.html)
