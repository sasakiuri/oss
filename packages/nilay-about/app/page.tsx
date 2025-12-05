import Image from "next/image";
import Link from "next/link";
import { Container, PageTitle } from "@/components/layout";
import {
  LuBookOpen,
  LuShoppingCart,
  LuCloud,
  LuFlaskConical,
} from "react-icons/lu";

const services = [
  {
    icon: LuBookOpen,
    title: "Knowledge",
    href: "https://knowledge.nilay.jp/",
    linkText: "Knowledge に移動",
    description:
      "銃・射撃・狩猟に関する知識を収集・調査し紹介しています。申請や申込の方法についても記載しておりますので必要なときにご覧ください。",
    external: true,
  },
  {
    icon: LuShoppingCart,
    title: "E-commerce",
    href: "https://www.nilay.jp/",
    linkText: "通信販売サイトに移動",
    description:
      "射撃用品・狩猟用品・鳥獣被害対策用品を販売しています。幅広い種類の商品を取り揃えるようにしておりますのでぜひご利用ください。",
    external: true,
  },
  {
    icon: LuCloud,
    title: "Gunman",
    href: "https://gunman.nilay.jp/",
    linkText: "Gunman に移動",
    description:
      "申請書・申込書・各種添付書類を作成することができます。この他に火薬類、銃、各種証明書の管理機能も現在試験的に運用中です。",
    external: true,
  },
  {
    icon: LuFlaskConical,
    title: "Labs",
    href: "/labs",
    linkText: "Labs に移動",
    description: "試験的に作成したツールなどを公開しています。",
    external: false,
  },
];

function ServiceCard({
  icon: Icon,
  title,
  href,
  linkText,
  description,
  external,
}: (typeof services)[0]) {
  const LinkComponent = external ? "a" : Link;
  const linkProps = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <div className="text-center">
      <div className="flex justify-center text-foreground">
        <Icon className="h-16 w-16" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
      <LinkComponent
        href={href}
        className="mt-2 inline-block text-primary hover:underline"
        {...linkProps}
      >
        {linkText}
      </LinkComponent>
      <p className="mt-4 text-left text-sm text-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <Container>
      <PageTitle title="ようこそ！！" subtitle="Nilay/About" />

      <div className="my-8 flex justify-center">
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
            className="rounded"
            priority
          />
        </a>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {services.slice(0, 3).map((service) => (
          <ServiceCard key={service.title} {...service} />
        ))}
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {services.slice(3).map((service) => (
          <ServiceCard key={service.title} {...service} />
        ))}
      </div>
    </Container>
  );
}
