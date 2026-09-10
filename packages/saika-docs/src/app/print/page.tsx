// SPDX-License-Identifier: MIT
import { getDocuments } from '@/entities/document/server/repository';
import { DocumentMarkdown } from '@/features/reading/markdown';
import { site } from '@/shared/config/site';

export const metadata = { title: '印刷用マニュアル', robots: { index: false, follow: false } };
export default function Page() {
  return (
    <main id="main-content" className="print-book min-w-0">
      <h1>{site.name} マニュアル</h1>
      <p>Version {site.version}</p>
      {getDocuments().map((document) => (
        <section key={document.href} className="print-chapter" data-document-href={document.href}>
          <h2>{document.title}</h2>
          <DocumentMarkdown document={document} />
        </section>
      ))}
    </main>
  );
}
