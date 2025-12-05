import type { Metadata } from "next";
import { Container, PageTitle } from "@/components/layout";
import { ContactForm } from "./contact-form";
import { ContactInfo } from "./contact-info";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description:
    "お気軽にお問い合わせください。Email、電話、各種 SNS でもお問い合わせいただけます。",
};

export default function ContactPage() {
  return (
    <Container size="sm">
      <PageTitle title="お問い合わせ" subtitle="Contact" />
      <div className="mt-8 space-y-8">
        <ContactForm />
        <ContactInfo />
      </div>
    </Container>
  );
}
