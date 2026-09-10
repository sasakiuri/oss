// SPDX-License-Identifier: MIT
export interface Heading {
  id: string;
  text: string;
  depth: number;
}

export interface DocumentRecord {
  published?: string;
  updated?: string;
  tags?: string[];
  image?: string;
  sourcePath: string;
  slug: string[];
  href: string;
  title: string;
  description: string;
  markdown: string;
  text: string;
  headings: Heading[];
}

export interface SearchDocument {
  id: string;
  title: string;
  section: string;
  text: string;
}

export interface NavigationGroup {
  title: string;
  items: { title: string; href: string }[];
}
