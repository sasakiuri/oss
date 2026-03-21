// SPDX-License-Identifier: MIT
import { createRoot } from 'react-dom/client';

import { ScoreSheetPrintScreen } from './presentation/screens/print/ScoreSheetPrintScreen';
import './presentation/styles/print.css';

createRoot(document.getElementById('print-root')!).render(<ScoreSheetPrintScreen />);
