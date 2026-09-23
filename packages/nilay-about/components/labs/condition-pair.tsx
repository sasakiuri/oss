'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { SegmentedControl } from './segmented-control';

interface ConditionSide {
  id: string;
  label: string;
  content: ReactNode;
  /**
   * Set while this side has a field marked as wrong or a caution showing. The switch then says so,
   * because on a phone the side that is not shown cannot show it itself.
   */
  needsAttention?: boolean;
}

interface ConditionPairProps {
  /** Names the switch, which is only on screen where the two conditions do not both fit. */
  legend: string;
  /** Read after the name of a side that needs attention, and shown as a mark beside it. */
  attentionLabel: string;
  first: ConditionSide;
  second: ConditionSide;
}

/**
 * Two conditions to compare, one at a time on a phone.
 *
 * A comparison is edited one side at a time. Stacked on a phone, the two full forms put the answer
 * some 1,600 px below the first of them, so changing condition A showed nothing. Below the wide
 * layout a switch shows one condition, and the answer follows it straight away; on a wide screen
 * both stay side by side with the answer beside them, and the switch is not shown.
 */
export function ConditionPair({ legend, attentionLabel, first, second }: ConditionPairProps) {
  const [shown, setShown] = useState(first.id);

  useEffect(() => {
    // A jump link to the hidden condition has to bring it forward.
    // So does the same link followed again, which changes no hash.
    const follow = () => {
      const id = window.location.hash.slice(1);
      if (id === first.id || id === second.id) setShown(id);
    };
    const followLink = (event: MouseEvent) => {
      const href = event.target instanceof Element ? event.target.closest('a[href]')?.getAttribute('href') : null;
      const id = href?.slice(href.lastIndexOf('#') + 1);
      if (href?.includes('#') && (id === first.id || id === second.id)) setShown(id);
    };
    follow();
    window.addEventListener('hashchange', follow);
    document.addEventListener('click', followLink);
    return () => {
      window.removeEventListener('hashchange', follow);
      document.removeEventListener('click', followLink);
    };
  }, [first.id, second.id]);

  return (
    <>
      <div className="lg:hidden print:hidden">
        <SegmentedControl
          legend={legend}
          orientation="inline"
          value={shown}
          onChange={setShown}
          options={[first, second].map((side) => ({
            value: side.id,
            label: side.needsAttention ? (
              <>
                {side.label}
                <span aria-hidden="true" className="ml-1.5 inline-block size-2 rounded-full bg-error" />
                <span className="sr-only">（{attentionLabel}）</span>
              </>
            ) : (
              side.label
            ),
          }))}
        />
      </div>
      {/* Paper is narrower than the wide layout, and a comparison printed with one side missing
          would set a table of A and B beside the inputs of only one of them. */}
      <div className={shown === first.id ? undefined : 'hidden lg:block print:!block'}>{first.content}</div>
      <div className={shown === second.id ? undefined : 'hidden lg:block print:!block'}>{second.content}</div>
    </>
  );
}
