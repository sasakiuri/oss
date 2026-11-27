// SPDX-License-Identifier: MIT
import {
  VistaCatalogSchema,
  VistaSnapshotSchema,
  VISTA_CATALOG_PATH,
  vistaSnapshotPath,
} from '@sasakiuri/saika-protocol/Vista';
import { requestVista } from '@sasakiuri/saika-protocol/vista-node';

import { findEntry, type ScreenConfig, type SourceView } from '../shared/model';

import type { DisplayState } from './DisplayState';
import { Endpoint, messageOf, type Document } from './document';

type Source = Document['sources'][number];

function sourceView(
  source: Pick<Source, 'id' | 'endpoint'>,
  catalog: Source['catalog'],
  state: SourceView['state'],
  error: string | null = null,
): SourceView {
  return { id: source.id, endpoint: source.endpoint, catalog, state, error };
}

/** Polls connected Lane and Director sources for the subjects that local and remote screens select. */
export class SourceAcquisition {
  private lastCatalog = new Map<string, number>();
  private views = new Map<string, SourceView>();

  constructor(
    private readonly state: DisplayState,
    /** Every screen whose selections this PC acquires: its own and its display PCs'. */
    private readonly screens: () => ScreenConfig[],
  ) {}

  /** The operator's view of each saved source; sources not yet polled are shown as connecting. */
  list(): SourceView[] {
    return this.state.document.sources.map(
      (source) => this.views.get(source.id) ?? sourceView(source, source.catalog, 'connecting'),
    );
  }

  /** The most recently received catalog of a saved source. */
  catalog(source: Source): Source['catalog'] {
    return this.views.get(source.id)?.catalog ?? source.catalog;
  }

  async connect(endpointInput: string, secret: string): Promise<void> {
    const endpoint = Endpoint.parse(endpointInput);
    const catalog = VistaCatalogSchema.parse(await requestVista(endpoint, secret, 'GET', VISTA_CATALOG_PATH));
    if (catalog.identity.kind === 'display') throw new Error('Choose a Lane or Director source');
    await this.state.transact((document) => ({
      ...document,
      sources: [
        ...document.sources.filter((source) => source.id !== catalog.identity.sourceId),
        { id: catalog.identity.sourceId, endpoint, secret, catalog },
      ],
      sourceIdentities: [
        ...document.sourceIdentities.filter((identity) => identity.sourceId !== catalog.identity.sourceId),
        catalog.identity,
      ],
    }));
    this.views.set(
      catalog.identity.sourceId,
      sourceView({ id: catalog.identity.sourceId, endpoint }, catalog, 'connected'),
    );
    this.lastCatalog.set(catalog.identity.sourceId, Date.now());
  }

  async remove(id: string): Promise<void> {
    await this.state.transact((document) => ({
      ...document,
      sources: document.sources.filter((source) => source.id !== id),
    }));
    for (const entry of this.state.getEntries())
      if (entry.snapshot.sourceId === id)
        await this.state.updateEntry({
          ...entry,
          state: 'saved',
          error: 'The source was disconnected by the operator',
        });
    this.views.delete(id);
    this.lastCatalog.delete(id);
  }

  async inspect(sourceId: string, subjectId: string): Promise<void> {
    const source = this.state.document.sources.find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error('Source is not connected');
    await this.fetchSubject(source, subjectId);
  }

  /** One poll of a source: refresh its catalog every five seconds, then fetch each selected subject in turn. */
  async poll(source: Source): Promise<void> {
    const isCurrent = () => this.isCurrent(source);
    if (!isCurrent()) return;
    try {
      let catalog = this.views.get(source.id)?.catalog ?? source.catalog;
      if (Date.now() - (this.lastCatalog.get(source.id) ?? 0) > 5000) {
        catalog = VistaCatalogSchema.parse(
          await requestVista(source.endpoint, source.secret, 'GET', VISTA_CATALOG_PATH, undefined, source.id),
        );
        if (catalog.identity.sourceId !== source.id || catalog.identity.kind !== source.catalog.identity.kind)
          throw new Error('The source identity changed');
        if (!isCurrent()) return;
        this.lastCatalog.set(source.id, Date.now());
      }
      if (!isCurrent()) return;
      this.views.set(source.id, sourceView(source, catalog, 'connected'));
      const subjects = new Set(
        this.screens().flatMap((screen) =>
          screen.selections
            .filter((selection) => selection.sourceId === source.id)
            .map((selection) => selection.subjectId),
        ),
      );
      for (const subjectId of subjects) {
        try {
          await this.fetchSubject(source, subjectId);
        } catch (error) {
          if (!isCurrent()) return;
          const old = findEntry(this.state.getEntries(), { sourceId: source.id, subjectId });
          if (old) await this.state.updateEntry({ ...old, state: 'stale', error: messageOf(error) }, isCurrent);
          if (!isCurrent()) return;
          this.views.set(source.id, sourceView(source, catalog, 'offline', messageOf(error)));
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      this.views.set(source.id, sourceView(source, source.catalog, 'offline', messageOf(error)));
    }
  }

  private isCurrent(source: Source): boolean {
    return (
      !this.state.document.controller && !this.state.document.releasing && this.state.document.sources.includes(source)
    );
  }

  private async fetchSubject(source: Source, subjectId: string): Promise<void> {
    if (!this.isCurrent(source)) return;
    const snapshot = VistaSnapshotSchema.parse(
      await requestVista(source.endpoint, source.secret, 'GET', vistaSnapshotPath(subjectId), undefined, source.id),
    );
    if (snapshot.sourceId !== source.id || snapshot.subjectId !== subjectId)
      throw new Error('Snapshot subject does not match the selection');
    if (source.catalog.identity.kind === 'lane' && snapshot.ranking)
      throw new Error('A Lane source must not provide rankings');
    const hasParticipants = snapshot.participants.length > 0;
    // Published competition results are reconfirmed by Director independently
    // of the completeness or availability of each Lane's target history.
    const confirmedPublication =
      source.catalog.identity.kind === 'director' && snapshot.ranking?.kind === 'competition';
    const stale =
      !confirmedPublication &&
      hasParticipants &&
      snapshot.participants.every((participant) => participant.dataState === 'stale');
    const incomplete =
      !confirmedPublication &&
      hasParticipants &&
      snapshot.participants.every((participant) => participant.dataState === 'stale' || !participant.historyComplete);
    await this.state.updateEntry(
      {
        snapshot,
        state: stale ? 'stale' : incomplete ? 'syncing' : 'live',
        receivedAt: Date.now(),
        error: stale
          ? 'The source cannot confirm current Lane data'
          : incomplete
            ? 'The source has not confirmed complete shooting history'
            : null,
      },
      () => this.isCurrent(source),
    );
  }
}
