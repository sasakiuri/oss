'use client';

import { useState } from 'react';
import { useStore } from 'zustand';

import { AppHeader, AppLayout, LanguageMenu } from '@/components/labs';
import { Card, CardContent } from '@/components/ui';

import { DisciplineEditor } from './components/discipline-editor';
import { LengthField } from './components/length-field';
import { TargetDownloadButton } from './components/target-download-button';
import { homeTargetText } from './messages';
import { calculateTarget, MAX_TARGET_DIAMETER_CM } from './model';
import { createHomeTargetStore } from './store';

export function HomeTargetClient() {
  const [store] = useState(createHomeTargetStore);
  const state = useStore(store);
  const {
    language,
    heightOfEye,
    distanceToTarget,
    discipline,
    setLanguage,
    setHeightOfEye,
    setDistanceToTarget,
    setDiscipline,
    selectDiscipline,
  } = state;
  const result = calculateTarget(state);
  const text = homeTargetText[language];
  const downloadable = result !== null && result.diameterCm > 0 && result.diameterCm <= MAX_TARGET_DIAMETER_CM;

  return (
    <AppLayout
      header={
        <AppHeader
          title={text.title}
          actions={
            <>
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
              <TargetDownloadButton diameterCm={downloadable ? result.diameterCm : null} language={language} />
            </>
          }
        />
      }
    >
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4" aria-live="polite">
              <div>
                <p className="text-sm text-muted-foreground">{text.heightOfTargetCenter}</p>
                <p className="text-2xl font-medium">{result ? Math.round(result.heightCm * 100) / 100 : '—'}&nbsp;cm</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{text.blackAreaSize}</p>
                <p className="text-2xl font-medium">
                  {result ? Math.round(result.diameterCm * 100) / 100 : '—'}&nbsp;cm
                </p>
              </div>
              {!downloadable && (
                <p role="status" className="text-sm text-muted-foreground">
                  {language === 'ja'
                    ? '各値を確認してください。PDF は黒い領域が 0cm より大きく、100cm 以下の場合に作成できます。'
                    : 'Check the measurements. PDFs require a black area greater than 0cm and no larger than 100cm.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <LengthField
          id="eyeHeight"
          label={text.eyeHeight}
          description={text.eyeHeightDesc}
          value={heightOfEye}
          onChange={setHeightOfEye}
        />
        <LengthField
          id="distanceToTarget"
          label={text.desiredDistance}
          description={text.desiredDistanceDesc}
          value={distanceToTarget}
          onChange={setDistanceToTarget}
        />
        <DisciplineEditor
          discipline={discipline}
          language={language}
          text={text}
          onChange={setDiscipline}
          onSelect={selectDiscipline}
        />
      </div>
    </AppLayout>
  );
}
