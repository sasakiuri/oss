// SPDX-License-Identifier: MIT
interface SectionTabsProps<T extends string> {
  label: string;
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  prefix: string;
}

export function SectionTabs<T extends string>({ label, tabs, value, onChange, prefix }: SectionTabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-1 border-b border-vscode-border">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`${prefix}-${tab.id}-tab`}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          aria-controls={value === tab.id ? `${prefix}-${tab.id}-panel` : undefined}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (index - 1 + tabs.length) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            onChange(tabs[next]!.id);
            document.getElementById(`${prefix}-${tabs[next]!.id}-tab`)?.focus();
          }}
          className={`min-h-10 border-b-2 px-3 py-2 text-[13px] font-medium ${
            value === tab.id
              ? 'border-vscode-primary text-vscode-text'
              : 'border-transparent text-vscode-text-muted hover:bg-vscode-hover hover:text-vscode-text'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
