import { ClockAlert } from 'lucide-react';

import { Card } from '../shared/common/Card';
import { PageHeader } from '../shared/layout/PageHeader';
import { RangeInterruptionsPanel } from './RangeInterruptionsPanel';

/** Global archive for interruption records whose live competition is no longer retained. */
export function RangeInterruptionsScreen() {
  return (
    <div className="min-h-full">
      <PageHeader
        title="Range Interruptions"
        description="Interruption facts, ISSF recommendations, official time grants, and Lane command audit."
        icon={<ClockAlert size={23} aria-hidden="true" />}
      />
      <div className="p-5">
        <Card>
          <RangeInterruptionsPanel />
        </Card>
      </div>
    </div>
  );
}
