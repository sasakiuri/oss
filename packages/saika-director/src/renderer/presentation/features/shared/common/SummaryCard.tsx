/** One labelled figure of a summary row. */
export function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <p className="text-xs text-vscode-text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-vscode-text">{value}</p>
    </div>
  );
}
