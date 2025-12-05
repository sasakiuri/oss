interface PageTitleProps {
  title: string;
  subtitle: string;
}

export function PageTitle({ title, subtitle }: PageTitleProps) {
  return (
    <div className="w-full text-center text-foreground">
      <div className="pt-12 text-3xl font-bold">{title}</div>
      <h1 className="text-xl font-normal">{subtitle}</h1>
    </div>
  );
}
