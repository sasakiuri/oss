import { Card } from '../shared/common/Card';
import { PageHeader } from '../shared/layout/PageHeader';
import { TargetExaminationsPanel } from './TargetExaminationsPanel';

/** Global archive for cases whose live competition is no longer retained. */
export function TargetExaminationsScreen() {
  return (
    <div className="min-h-full">
      <PageHeader title="Target Examinations" />
      <div className="p-5">
        <Card>
          <TargetExaminationsPanel />
        </Card>
      </div>
    </div>
  );
}
