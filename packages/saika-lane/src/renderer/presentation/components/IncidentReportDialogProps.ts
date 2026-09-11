// SPDX-License-Identifier: MIT

export interface IncidentReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onActiveChange: (active: boolean) => void;
}
