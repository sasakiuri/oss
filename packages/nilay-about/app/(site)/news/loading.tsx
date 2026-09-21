/**
 * Loading UI for News pages
 *
 * This component is shown while the page content is loading.
 * Uses Next.js streaming for instant loading states.
 */
export default function NewsLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>お知らせ (News)</h1>
      <p>Nilay からの最新情報です。商品の入荷情報やサービスのアップデート情報をお届けします。</p>
      <hr />
      <div role="status" aria-label="ニュースを読み込み中" className="mt-4">
        <p>読み込み中...</p>
      </div>
    </div>
  );
}
