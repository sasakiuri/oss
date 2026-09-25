'use client';

import { useEffect, useState } from 'react';

import { Card } from '@/components/ui';
import { errorKind, ERROR_MESSAGES } from '@/features/labs-notify/client';
import { ToolFrame } from '@/features/labs-notify/components/tool-frame';
import { readResultsId } from '@/lib/event-results';
import { requestJson } from '@/lib/http/client';
import { resultsViewSchema, type ResultsView as View } from '@/lib/schemas/event-results';

type State =
  { status: 'loading' } | { status: 'ready'; view: View } | { status: 'error'; kind: keyof typeof ERROR_MESSAGES };

export function ResultsView() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const id = readResultsId(window.location.hash);
    const request = id
      ? requestJson(`/api/labs/results/${id}`, resultsViewSchema, { signal: controller.signal, cache: 'no-store' })
      : Promise.reject(new Error('No id'));
    request
      .then((view) => setState({ status: 'ready', view }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', kind: id ? errorKind(error) : 'notFound' });
      });
    return () => controller.abort();
  }, []);

  return (
    <ToolFrame title={{ ja: '大会リザルト', en: 'Match results' }}>
      {(language) => {
        const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
        if (state.status === 'loading') return <p role="status">{t('読み込み中…', 'Loading…')}</p>;
        if (state.status === 'error') {
          return (
            <p role="alert" className="rounded-sm bg-error-container p-3 text-sm text-on-error-container">
              {ERROR_MESSAGES[state.kind][language]}
            </p>
          );
        }
        const { view } = state;
        return (
          <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
            <h2 className="text-2xl font-medium">{view.title}</h2>
            {view.note && <p className="whitespace-pre-wrap text-sm">{view.note}</p>}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{view.title}</caption>
                <thead>
                  <tr>
                    {view.columns.map((column, index) => (
                      <th key={index} scope="col" className="border-b border-outline-variant p-2 text-left font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="even:bg-surface-container">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="p-2">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-on-surface-variant">
              {t(
                `主催者による非公式の掲示。最終更新 ${new Date(view.updatedAt).toLocaleString('ja-JP')}、${new Date(view.expiresAt).toLocaleDateString('ja-JP')} に削除。`,
                `Unofficial, posted by the organiser. Updated ${new Date(view.updatedAt).toLocaleString('en-GB')}, deleted on ${new Date(view.expiresAt).toLocaleDateString('en-GB')}.`,
              )}
            </p>
          </Card>
        );
      }}
    </ToolFrame>
  );
}
