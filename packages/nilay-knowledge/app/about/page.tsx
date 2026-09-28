import Link from 'next/link';

import { Breadcrumb } from '@/components/breadcrumb';
import { JsonLd } from '@/components/json-ld';
import { SnsShare } from '@/components/sns-share';
import { siteConfig } from '@/lib/config';
import { createPageMetadata } from '@/lib/metadata';
import { createAboutSchema } from '@/lib/schema';

export const dynamic = 'force-static';

const title = 'このサイトについて';
const slug = 'about';
const description =
  'Nilay/Knowledge は、銃・射撃・狩猟に関する情報を蓄積し、体系的にまとめるサイトです。運営者、情報の確認方法、記事の訂正窓口、関連サービスを紹介します。';

export const metadata = createPageMetadata({
  title,
  description,
  path: '/about/',
});

interface CardProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: CardProps) {
  return (
    <div className="border-t border-line pt-5">
      <h2 className="section-title mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function AboutPage() {
  const { service } = siteConfig;

  return (
    <>
      <JsonLd data={createAboutSchema({ title, description })} />
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: title, slug },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-8 px-5 pt-6 pb-12 sm:px-8 sm:pt-8">
        <h1 className="page-title">{title}</h1>
        <Section title="概要">
          <div className="py-2">
            <p className="leading-relaxed">
              Nilay/Knowledge は銃・射撃・狩猟に関する情報を蓄積し体系的にまとめることを目的としています。
            </p>
          </div>
        </Section>

        <Section title="運営者・掲載情報の確認と訂正">
          <div className="space-y-4 py-2 leading-8">
            <p>運営・編集：{siteConfig.author.name}</p>
            <p>
              記事とニュースには公開日を表示し、更新日が記録されている場合は併記しています。日付は日本時間です。
              記事の「情報の最終確認日」は、掲載した資料と照合した日付です。対象地域と確認した範囲を併記し、
              記録がない記事では「未記録」と表示しています。本文の更新日とは区別しています。
              法令、手数料、講習日程などは変更されるため、記事の日付と出典をご確認ください。
              手続きや申込みの際は、参照先の官公庁・団体の案内や担当窓口で最新の情報をご確認ください。
            </p>
            <p>
              誤りや古い情報を見つけた場合は、各記事末尾の「修正を依頼（Issue）」または「編集して提案（PR）」から、
              対象の箇所と参考資料をお知らせください。GitHub
              を利用しない場合は、このページのお問い合わせ先をご利用ください。
            </p>
          </div>
        </Section>

        <Section title="コンテンツ">
          <ul className="divide-y divide-line">
            <li>
              <Link href="/articles" className="-mx-3 block px-3 py-4 hover:bg-muted">
                <span className="font-medium text-ink">記事一覧</span>
                <p className="mt-1 text-sm text-subtle">銃・射撃・狩猟に関する情報をまとめています。</p>
              </Link>
            </li>
            <li>
              <Link href="/news" className="-mx-3 block px-3 py-4 hover:bg-muted">
                <span className="font-medium text-ink">ニュース</span>
                <p className="mt-1 text-sm text-subtle">
                  銃・射撃・狩猟の事故・事件、法令に関するニュースをまとめています。
                </p>
              </Link>
            </li>
          </ul>
        </Section>

        <Section title="その他サービス">
          <ul className="divide-y divide-line">
            <li>
              <a
                href={service.ecommerce}
                target="_blank"
                rel="noopener noreferrer"
                className="-mx-3 block px-3 py-4 hover:bg-muted"
              >
                <span className="font-medium text-ink">通信販売</span>
                <p className="mt-1 text-sm text-subtle">
                  射撃・狩猟・有害鳥獣駆除に関する商品を取り扱っています。購入にあたり許可が必要な商品の取り扱いはしておりません。
                </p>
              </a>
            </li>
            <li>
              <a
                href={service.gunman}
                target="_blank"
                rel="noopener noreferrer"
                className="-mx-3 block px-3 py-4 hover:bg-muted"
              >
                <span className="font-medium text-ink">Nilay/Gunman</span>
                <p className="mt-1 text-sm text-subtle">申請・申込書類の作成や使用実績の管理を行うためのアプリです。</p>
              </a>
            </li>
          </ul>
        </Section>

        <Section title="SNS の運用について">
          <div className="space-y-4 py-2 leading-8">
            <p>
              X の{' '}
              <a
                href={`https://x.com/${siteConfig.social.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline underline-offset-4"
              >
                @{siteConfig.social.twitter}
              </a>{' '}
              では、銃・射撃・狩猟などに関するニュースを自動で収集・選定し、ニュース 1
              件ごとに見出しと配信元の記事へのリンクを個別に投稿しています。話題の分類には AI を利用しています。
            </p>
            <p>主に次の話題を扱います。国内のニュースを中心に、関連する海外のニュースも紹介します。</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>銃に関する事件・事故</li>
              <li>射撃競技、狩猟と、それらに関する制度・官公庁の発表・パブリックコメント</li>
              <li>野生の鳥類・哺乳類による被害、捕獲・駆除、保護、調査・研究（外来種を含む）</li>
              <li>ジビエ</li>
              <li>これらに関連する製品や活用の事例</li>
            </ul>
            <p>
              日本ライフル射撃協会、日本クレー射撃協会、日本ジビエ振興協会が公開する記事は、AI
              による分類の結果にかかわらず紹介の候補になります。
            </p>
            <p>
              自動投稿の送信時間帯は毎日 06:00〜23:00（日本時間、23:00 以降の送信は停止）です。1
              時間ごとに、その時点で投稿対象となるニュースをすべて、新しい順に 1
              件ずつ連続投稿します。夜間も収集と分類は続けています。
            </p>
            <p>
              送信時点での投稿対象は、公開時刻が分かる記事は公開から 24
              時間以内、日付だけの記事は日本時間の今日・昨日のものです。すべての関連記事の配信や、速報性を保証するものではありません。
            </p>
            <p>
              自動選定には誤りが含まれることがあります。紹介は内容の正確性の保証や配信元の見解への賛同を意味しません。詳しい内容や最新の状況は、配信元の記事でご確認ください。
            </p>
          </div>
        </Section>

        <Section title="お問い合わせ">
          <div className="py-2">
            <p className="leading-relaxed">
              <a
                href={`${service.about}/contact`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline underline-offset-4"
              >
                Nilay/About
              </a>{' '}
              よりお問い合わせください。
            </p>
          </div>
        </Section>
        <SnsShare title={title} slug={slug} />
      </div>
    </>
  );
}
