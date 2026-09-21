import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { LuPencil } from 'react-icons/lu';

import { Button, Label } from '@/components/ui';

import { disciplines } from '../disciplines';
import type { HomeTargetText } from '../messages';
import type { Discipline, Language } from '../model';

import { LengthField } from './length-field';

interface DisciplineEditorProps {
  discipline: Discipline;
  language: Language;
  text: HomeTargetText;
  onChange: (discipline: Discipline) => void;
  onSelect: (key: string) => void;
}

export function DisciplineEditor({ discipline, language, text, onChange, onSelect }: DisciplineEditorProps) {
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const readOnly = discipline.key !== 'CUSTOM';

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div ref={setPortalContainer} className="flex items-center justify-between rounded-md border p-4">
        <div className="space-y-1">
          <p className="font-medium">{discipline.name}</p>
          <p className="text-sm text-muted-foreground">
            {text.distance}: {discipline.distance.number} {discipline.distance.unit}
          </p>
          <p className="text-sm text-muted-foreground">
            {text.heightOfTargetCenter}: {discipline.heightOfTarget.number} {discipline.heightOfTarget.unit}
          </p>
          <p className="text-sm text-muted-foreground">
            {text.blackAreaSize}: {discipline.blackAreaSize.number} {discipline.blackAreaSize.unit}
          </p>
        </div>
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={language === 'ja' ? '競技種目を編集' : 'Edit discipline'}>
            <LuPencil className="h-4 w-4" />
          </Button>
        </Dialog.Trigger>
      </div>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/[0.32] animate-in fade-in duration-200" />
        <Dialog.Content
          className={[
            'fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2',
            'max-h-[90vh] w-[90vw] max-w-md overflow-auto rounded-[28px] bg-[#ebedeb] p-6',
            'shadow-[0_4px_8px_3px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.3)]',
            'animate-in fade-in zoom-in-95 duration-200 text-[#1f1f1f]',
            "font-[Roboto,-apple-system,BlinkMacSystemFont,'Noto_Sans_JP','Segoe_UI',sans-serif]",
          ].join(' ')}
        >
          <Dialog.Title className="text-2xl leading-8 font-normal">{text.discipline}</Dialog.Title>
          <Dialog.Description className="sr-only">{text.disciplineDesc}</Dialog.Description>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discipline" className="text-sm font-medium text-[#444746]">
                {text.discipline}
              </Label>
              <select
                id="discipline"
                className="w-full h-14 px-4 rounded border border-[#747775] bg-white text-base text-[#1f1f1f] focus:outline-none focus:border-[#1a73e8] focus:border-2 transition-colors duration-200"
                value={discipline.key}
                onChange={(event) => onSelect(event.target.value)}
              >
                {Array.from(disciplines.values()).map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.name}
                  </option>
                ))}
                <option value="CUSTOM">Custom</option>
              </select>
              <p className="text-sm text-[#444746]">{text.disciplineDesc}</p>
            </div>
            <LengthField
              id="shootingDistance"
              label={text.shootingDistance}
              value={discipline.distance}
              readOnly={readOnly}
              onChange={(distance) => onChange({ ...discipline, distance })}
            />
            <LengthField
              id="targetHeight"
              label={text.heightOfTargetCenter}
              value={discipline.heightOfTarget}
              readOnly={readOnly}
              onChange={(heightOfTarget) => onChange({ ...discipline, heightOfTarget })}
            />
            <LengthField
              id="blackAreaSize"
              label={text.blackAimingAreaSize}
              value={discipline.blackAreaSize}
              readOnly={readOnly}
              onChange={(blackAreaSize) => onChange({ ...discipline, blackAreaSize })}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <Button>OK</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
