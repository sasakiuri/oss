// SPDX-License-Identifier: MIT

import { Bell } from 'lucide-react';
import { useState } from 'react';

import { Modal } from './common/Modal';
import { EstComplaintSignalControl } from './EstComplaintSignalControl';
import { QualificationMalfunctionSignalControl } from './QualificationMalfunctionSignalControl';
import { RangeOfficerRequestControl } from './RangeOfficerRequestControl';
import { SideMenuButton } from './SideMenuButton';

type ReportView = 'menu' | 'request' | 'malfunction' | 'est' | null;

export function RangeOfficerMenu() {
  const [view, setView] = useState<ReportView>(null);
  const [requestActive, setRequestActive] = useState(false);
  const [malfunctionActive, setMalfunctionActive] = useState(false);
  const [estActive, setEstActive] = useState(false);
  const hasActiveReports = requestActive || malfunctionActive || estActive;
  const close = () => setView(null);
  const reports = [
    { view: 'request', label: 'Call RO', active: requestActive },
    { view: 'malfunction', label: 'Declare malfunction', active: malfunctionActive },
    { view: 'est', label: 'EST complaint', active: estActive },
  ] as const;

  return (
    <>
      <SideMenuButton
        icon={
          <span className="relative" aria-hidden="true">
            <Bell size={30} />
            {hasActiveReports && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-300" />}
          </span>
        }
        label={hasActiveReports ? 'Range Officer (active requests)' : 'Range Officer'}
        aria-haspopup="dialog"
        onClick={() => setView('menu')}
      />

      <Modal isOpen={view === 'menu'} onClose={close} title="Range Officer" className="max-w-sm">
        <div className="divide-y divide-vscode-border">
          {reports.map((report) => (
            <button
              key={report.view}
              type="button"
              className="flex min-h-14 w-full items-center justify-between gap-4 px-2 py-3 text-left text-sm text-vscode-text hover:bg-vscode-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vscode-primary"
              onClick={() => setView(report.view)}
            >
              <span>{report.label}</span>
              {report.active && <span className="text-xs text-amber-300">Active</span>}
            </button>
          ))}
        </div>
      </Modal>

      <RangeOfficerRequestControl isOpen={view === 'request'} onClose={close} onActiveChange={setRequestActive} />
      <QualificationMalfunctionSignalControl
        isOpen={view === 'malfunction'}
        onClose={close}
        onActiveChange={setMalfunctionActive}
      />
      <EstComplaintSignalControl isOpen={view === 'est'} onClose={close} onActiveChange={setEstActive} />
    </>
  );
}
