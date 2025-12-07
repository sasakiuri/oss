import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/breadcrumb';
import { SnsShare } from '@/components/sns-share';
import { siteConfig } from '@/lib/config';

const title = 'このサイトについて';
const slug = 'about';

export const metadata: Metadata = {
  title,
};

interface CardProps {
  title: string;
  children: React.ReactNode;
}

function Card({ title, children }: CardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-lg font-bold text-slate-800">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function AboutPage() {
  const { service } = siteConfig;

  return (
    <>
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: title, slug },
        ]}
      />
      <SnsShare title={title} slug={slug} />

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <Card title="このサイトについて">
          <div className="p-4">
            <p className="leading-relaxed">
              Nilay/Knowledge
              は銃・射撃・狩猟に関する情報を蓄積し体系的にまとめることを目的としています。
            </p>
          </div>
        </Card>

        <Card title="コンテンツ">
          <ul className="divide-y divide-slate-200">
            <li>
              <Link
                href="/articles"
                className="block px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">Articles</span>
                <p className="mt-1 text-sm text-slate-600">
                  銃・射撃・狩猟に関する情報をまとめています。
                </p>
              </Link>
            </li>
            <li>
              <Link href="/news" className="block px-4 py-3 hover:bg-slate-50">
                <span className="font-medium text-slate-800">News</span>
                <p className="mt-1 text-sm text-slate-600">
                  銃・射撃・狩猟の事故・事件、法令に関するニュースをまとめています。
                </p>
              </Link>
            </li>
          </ul>
        </Card>

        <Card title="その他サービス">
          <ul className="divide-y divide-slate-200">
            <li>
              <a
                href={service.ecommerce}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">通信販売</span>
                <p className="mt-1 text-sm text-slate-600">
                  射撃・狩猟・有害鳥獣駆除に関する商品を取り扱っています。購入にあたり許可が必要な商品の取り扱いはしておりません。
                </p>
              </a>
            </li>
            <li>
              <a
                href={service.gunman}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">Nilay/Gunman</span>
                <p className="mt-1 text-sm text-slate-600">
                  申請・申込書類の作成や使用実績の管理を行うためのアプリです。
                </p>
              </a>
            </li>
          </ul>
        </Card>

        <Card title="SNS の運用について">
          <div className="space-y-4 p-4 leading-relaxed">
            <p>
              毎日12:00と20:00に Twitter
              で銃・射撃・狩猟に関するニュースを配信しています。配信するニュースの基準は、ニュースやプレスリリースの場合有料会員登録せずに読める文章が十分にあり、以下のいずれかを満たすニュースです。
            </p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                銃・射撃・狩猟・有害鳥獣駆除に関連したパブリックコメント情報、官公庁の発表、通達
              </li>
              <li>
                射撃スポーツやその普及に関するニュースおよびプレスリリース
              </li>
              <li>狩猟や有害鳥獣駆除に関するニュースおよびプレスリリース</li>
              <li>
                狩猟鳥獣による鳥獣被害とその対策に関するニュースおよびプレスリリース
              </li>
              <li>ジビエに関するニュースおよびプレスリリース</li>
            </ul>
            <p>
              また、コラムや論評は署名がある場合のみ配信しますが、特定の分野では扇動的なニュースが配信される場合がありますのでご了承ください。
            </p>
          </div>
        </Card>

        <Card title="お問い合わせ">
          <div className="p-4">
            <p className="leading-relaxed">
              <a
                href={`${service.about}/contact`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Nilay/About
              </a>{' '}
              よりお問い合わせください。
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
