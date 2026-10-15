// SPDX-License-Identifier: MIT
/** Portable repository composed from stores sharing one optimistic transaction boundary. */
import { clock as defaultClock, type Clock } from "../domain.ts";
import type { NewsRepository } from "../repository.ts";
import type { SourceConfig } from "../sources/types.ts";

import { ArticleReader } from "./article-reader.ts";
import { ArticleStore } from "./article-store.ts";
import { ConfigurationStore } from "./configuration-store.ts";
import { JobStore } from "./job-store.ts";
import { PublicationStore } from "./publication-store.ts";
import { RecordStore } from "./record-store.ts";
import type { SqlDriver } from "./sql.ts";
import { TransactionStore, type StorageContext } from "./transaction-store.ts";

export class SQLRepository implements NewsRepository {
  readonly driver: SqlDriver;
  private readonly transactions: TransactionStore;
  private readonly configuration: ConfigurationStore;
  private readonly articleStore: ArticleStore;
  private readonly articleReader: ArticleReader;
  private readonly publications: PublicationStore;
  private readonly jobs: JobStore;
  private readonly records: RecordStore;

  constructor(
    driver: SqlDriver,
    sources: readonly SourceConfig[],
    clock: Clock = defaultClock,
  ) {
    this.driver = driver;
    this.transactions = new TransactionStore(driver);
    const context: StorageContext = {
      driver,
      clock,
      transactions: this.transactions,
    };
    const configuredSources = structuredClone(sources);
    this.configuration = new ConfigurationStore(context, configuredSources);
    this.records = new RecordStore(context);
    this.articleStore = new ArticleStore(context);
    this.articleReader = new ArticleReader(context);
    this.publications = new PublicationStore(
      context,
      this.articleReader,
      this.records,
    );
    this.jobs = new JobStore(
      context,
      configuredSources,
      this.records,
      this.articleReader,
    );
  }

  initialize(
    ...args: Parameters<NewsRepository["initialize"]>
  ): ReturnType<NewsRepository["initialize"]> {
    return this.configuration.initialize(...args);
  }

  settings(
    ...args: Parameters<NewsRepository["settings"]>
  ): ReturnType<NewsRepository["settings"]> {
    return this.configuration.settings(...args);
  }

  settingsSnapshot(
    ...args: Parameters<NewsRepository["settingsSnapshot"]>
  ): ReturnType<NewsRepository["settingsSnapshot"]> {
    return this.configuration.settingsSnapshot(...args);
  }

  updateSettings(
    ...args: Parameters<NewsRepository["updateSettings"]>
  ): ReturnType<NewsRepository["updateSettings"]> {
    return this.configuration.updateSettings(...args);
  }

  sources(
    ...args: Parameters<NewsRepository["sources"]>
  ): ReturnType<NewsRepository["sources"]> {
    return this.configuration.sources(...args);
  }

  updateSource(
    ...args: Parameters<NewsRepository["updateSource"]>
  ): ReturnType<NewsRepository["updateSource"]> {
    return this.configuration.updateSource(...args);
  }

  scheduleAutoCollection(
    ...args: Parameters<NewsRepository["scheduleAutoCollection"]>
  ): ReturnType<NewsRepository["scheduleAutoCollection"]> {
    return this.configuration.scheduleAutoCollection(...args);
  }

  ingest(
    ...args: Parameters<NewsRepository["ingest"]>
  ): ReturnType<NewsRepository["ingest"]> {
    return this.articleStore.ingest(...args);
  }

  articles(
    ...args: Parameters<NewsRepository["articles"]>
  ): ReturnType<NewsRepository["articles"]> {
    return this.articleReader.articles(...args);
  }

  article(
    ...args: Parameters<NewsRepository["article"]>
  ): ReturnType<NewsRepository["article"]> {
    return this.articleReader.article(...args);
  }

  articlePage(
    ...args: Parameters<NewsRepository["articlePage"]>
  ): ReturnType<NewsRepository["articlePage"]> {
    return this.articleReader.articlePage(...args);
  }

  articleCounts(
    ...args: Parameters<NewsRepository["articleCounts"]>
  ): ReturnType<NewsRepository["articleCounts"]> {
    return this.articleReader.articleCounts(...args);
  }

  review(
    ...args: Parameters<NewsRepository["review"]>
  ): ReturnType<NewsRepository["review"]> {
    return this.articleStore.review(...args);
  }

  dismiss(
    ...args: Parameters<NewsRepository["dismiss"]>
  ): ReturnType<NewsRepository["dismiss"]> {
    return this.articleStore.dismiss(...args);
  }

  reviewMany(
    ...args: Parameters<NewsRepository["reviewMany"]>
  ): ReturnType<NewsRepository["reviewMany"]> {
    return this.articleStore.reviewMany(...args);
  }

  pruneArticles(
    ...args: Parameters<NewsRepository["pruneArticles"]>
  ): ReturnType<NewsRepository["pruneArticles"]> {
    return this.articleStore.pruneArticles(...args);
  }

  postedUrl(
    ...args: Parameters<NewsRepository["postedUrl"]>
  ): ReturnType<NewsRepository["postedUrl"]> {
    return this.articleReader.postedUrl(...args);
  }

  relationPool(
    ...args: Parameters<NewsRepository["relationPool"]>
  ): ReturnType<NewsRepository["relationPool"]> {
    return this.articleReader.relationPool(...args);
  }

  postedArticles(
    ...args: Parameters<NewsRepository["postedArticles"]>
  ): ReturnType<NewsRepository["postedArticles"]> {
    return this.articleReader.postedArticles(...args);
  }

  existingArticleIds(
    ...args: Parameters<NewsRepository["existingArticleIds"]>
  ): ReturnType<NewsRepository["existingArticleIds"]> {
    return this.articleReader.existingArticleIds(...args);
  }

  analyzeResult(
    ...args: Parameters<NewsRepository["analyzeResult"]>
  ): ReturnType<NewsRepository["analyzeResult"]> {
    return this.articleStore.analyzeResult(...args);
  }

  pendingArticles(
    ...args: Parameters<NewsRepository["pendingArticles"]>
  ): ReturnType<NewsRepository["pendingArticles"]> {
    return this.articleReader.pendingArticles(...args);
  }

  publicationState(
    ...args: Parameters<NewsRepository["publicationState"]>
  ): ReturnType<NewsRepository["publicationState"]> {
    return this.publications.publicationState(...args);
  }

  postCandidates(
    ...args: Parameters<NewsRepository["postCandidates"]>
  ): ReturnType<NewsRepository["postCandidates"]> {
    return this.publications.postCandidates(...args);
  }

  recoverPosts(
    ...args: Parameters<NewsRepository["recoverPosts"]>
  ): ReturnType<NewsRepository["recoverPosts"]> {
    return this.publications.recoverPosts(...args);
  }

  claimPost(
    ...args: Parameters<NewsRepository["claimPost"]>
  ): ReturnType<NewsRepository["claimPost"]> {
    return this.publications.claimPost(...args);
  }

  authorizePostSend(
    ...args: Parameters<NewsRepository["authorizePostSend"]>
  ): ReturnType<NewsRepository["authorizePostSend"]> {
    return this.publications.authorizePostSend(...args);
  }

  finishPost(
    ...args: Parameters<NewsRepository["finishPost"]>
  ): ReturnType<NewsRepository["finishPost"]> {
    return this.publications.finishPost(...args);
  }

  submitPost(
    ...args: Parameters<NewsRepository["submitPost"]>
  ): ReturnType<NewsRepository["submitPost"]> {
    return this.publications.submitPost(...args);
  }

  claimPostCheck(
    ...args: Parameters<NewsRepository["claimPostCheck"]>
  ): ReturnType<NewsRepository["claimPostCheck"]> {
    return this.publications.claimPostCheck(...args);
  }

  deferPostCheck(
    ...args: Parameters<NewsRepository["deferPostCheck"]>
  ): ReturnType<NewsRepository["deferPostCheck"]> {
    return this.publications.deferPostCheck(...args);
  }

  recordBufferQuota(
    ...args: Parameters<NewsRepository["recordBufferQuota"]>
  ): ReturnType<NewsRepository["recordBufferQuota"]> {
    return this.publications.recordBufferQuota(...args);
  }

  reserveBufferRequest(
    ...args: Parameters<NewsRepository["reserveBufferRequest"]>
  ): ReturnType<NewsRepository["reserveBufferRequest"]> {
    return this.publications.reserveBufferRequest(...args);
  }

  resolvePost(
    ...args: Parameters<NewsRepository["resolvePost"]>
  ): ReturnType<NewsRepository["resolvePost"]> {
    return this.publications.resolvePost(...args);
  }

  getJob(
    ...args: Parameters<NewsRepository["getJob"]>
  ): ReturnType<NewsRepository["getJob"]> {
    return this.jobs.getJob(...args);
  }

  queueJob(
    ...args: Parameters<NewsRepository["queueJob"]>
  ): ReturnType<NewsRepository["queueJob"]> {
    return this.jobs.queueJob(...args);
  }

  queueAutomaticJob(
    ...args: Parameters<NewsRepository["queueAutomaticJob"]>
  ): ReturnType<NewsRepository["queueAutomaticJob"]> {
    return this.jobs.queueAutomaticJob(...args);
  }

  claimJob(
    ...args: Parameters<NewsRepository["claimJob"]>
  ): ReturnType<NewsRepository["claimJob"]> {
    return this.jobs.claimJob(...args);
  }

  updateJob(
    ...args: Parameters<NewsRepository["updateJob"]>
  ): ReturnType<NewsRepository["updateJob"]> {
    return this.jobs.updateJob(...args);
  }

  releaseJob(
    ...args: Parameters<NewsRepository["releaseJob"]>
  ): ReturnType<NewsRepository["releaseJob"]> {
    return this.jobs.releaseJob(...args);
  }

  finishJob(
    ...args: Parameters<NewsRepository["finishJob"]>
  ): ReturnType<NewsRepository["finishJob"]> {
    return this.jobs.finishJob(...args);
  }

  getRecord<T extends object = Record<string, unknown>>(
    namespace: string,
    key: string,
  ): Promise<T | null> {
    return this.records.getRecord<T>(namespace, key);
  }

  putRecord(
    ...args: Parameters<NewsRepository["putRecord"]>
  ): ReturnType<NewsRepository["putRecord"]> {
    return this.records.putRecord(...args);
  }

  deleteRecord(
    ...args: Parameters<NewsRepository["deleteRecord"]>
  ): ReturnType<NewsRepository["deleteRecord"]> {
    return this.records.deleteRecord(...args);
  }

  acquireHost(
    ...args: Parameters<NewsRepository["acquireHost"]>
  ): ReturnType<NewsRepository["acquireHost"]> {
    return this.records.acquireHost(...args);
  }

  releaseHost(
    ...args: Parameters<NewsRepository["releaseHost"]>
  ): ReturnType<NewsRepository["releaseHost"]> {
    return this.records.releaseHost(...args);
  }

  getBlob(
    ...args: Parameters<NewsRepository["getBlob"]>
  ): ReturnType<NewsRepository["getBlob"]> {
    return this.records.getBlob(...args);
  }

  putBlob(
    ...args: Parameters<NewsRepository["putBlob"]>
  ): ReturnType<NewsRepository["putBlob"]> {
    return this.records.putBlob(...args);
  }

  stateVersion(
    ...args: Parameters<NewsRepository["stateVersion"]>
  ): ReturnType<NewsRepository["stateVersion"]> {
    return this.transactions.stateVersion(...args);
  }
}
