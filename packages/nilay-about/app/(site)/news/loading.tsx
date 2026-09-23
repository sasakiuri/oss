import { NewsHeading } from './news-heading';
import { NewsLoadingNotice } from './news-loading-notice';

/**
 * Loading UI for News pages
 *
 * This component is shown while the page content is loading.
 * Uses Next.js streaming for instant loading states.
 */
export default function NewsLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <NewsHeading />
      <hr />
      <NewsLoadingNotice />
    </div>
  );
}
