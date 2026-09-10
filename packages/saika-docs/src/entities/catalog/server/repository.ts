// SPDX-License-Identifier: MIT
import 'server-only';
import records from '../../../../.generated/documents.json';
import { catalogSchema } from '../model';

export function getCatalog() {
  return catalogSchema.parse(
    records.map((record) => ({
      id: record.href,
      title: record.title,
      href: record.href,
      description: record.description,
    })),
  );
}
