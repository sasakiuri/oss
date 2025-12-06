import Image from "next/image";
import Link from "next/link";

const services = [
  {
    title: "Knowledge",
    href: "https://knowledge.nilay.jp/",
    description:
      "銃・射撃・狩猟に関する知識を収集・調査し紹介しています。申請や申込の方法についても記載しておりますので必要なときにご覧ください。",
    external: true,
  },
  {
    title: "E-commerce",
    href: "https://www.nilay.jp/",
    description:
      "射撃用品・狩猟用品・鳥獣被害対策用品を販売しています。幅広い種類の商品を取り揃えるようにしておりますのでぜひご利用ください。",
    external: true,
  },
  {
    title: "Gunman",
    href: "https://gunman.nilay.jp/",
    description:
      "申請書・申込書・各種添付書類を作成することができます。この他に火薬類、銃、各種証明書の管理機能も現在試験的に運用中です。",
    external: true,
  },
  {
    title: "Labs",
    href: "/labs",
    description: "試験的に作成したツールなどを公開しています。",
    external: false,
  },
];

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>ようこそ！！</h1>

      <p>
        Nilay
        では射撃・狩猟・有害鳥獣駆除に関するサービスを提供しています。少しでも使いやすいサービスにしていきたいと思っておりますのでよろしくお願いいたします。
      </p>

      <div className="my-8">
        <a
          href="https://www.irasutoya.com/2015/03/blog-post_346.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            src="/images/home-tanuki.png"
            alt="たぬき"
            width={200}
            height={200}
            priority
          />
        </a>
        <p className="text-sm">(イラスト: いらすとや)</p>
      </div>

      <hr />

      <h2>Services</h2>

      <p>以下のサービスを提供しています:</p>

      <dl>
        {services.map((service) => {
          const LinkComponent = service.external ? "a" : Link;
          const linkProps = service.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {};

          return (
            <div key={service.title} className="mb-4">
              <dt className="font-bold">
                <LinkComponent href={service.href} {...linkProps}>
                  {service.title}
                </LinkComponent>
              </dt>
              <dd className="ml-8">{service.description}</dd>
            </div>
          );
        })}
      </dl>

      <hr />

      <p>
        <Link href="/news">最新のニュース</Link>もご覧ください。ご質問・ご要望は
        <Link href="/contact">お問い合わせページ</Link>からお送りください。
      </p>
    </div>
  );
}
