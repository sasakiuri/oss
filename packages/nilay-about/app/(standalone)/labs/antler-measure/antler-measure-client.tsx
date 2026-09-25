'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { LuImagePlus, LuPlus, LuTrash2, LuUndo2 } from 'react-icons/lu';

import { AppHeader, AppLayout, CameraCapture, LanguageMenu, NumberField, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { centimetresPerPixel, measuredCentimetres, type Point } from '@/lib/antler-measure';
import { labsTool } from '@/lib/labs-tools';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

interface Measure {
  id: string;
  name: string;
  points: Point[];
}

/** What the next tap on the photo does. */
type Target = { kind: 'scale' } | { kind: 'measure'; id: string };

const MAX_NAME = 30;

/**
 * Lengths on a photo of antlers, tusks or a skull, scaled by an object of known length in the same
 * picture. The photo stays in memory and is dropped when the page closes; nothing is saved or sent.
 */
export function AntlerMeasureClient() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; width: number; height: number } | null>(null);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [referenceCm, setReferenceCm] = useState<number | null>(null);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [target, setTarget] = useState<Target>({ kind: 'scale' });
  const [problem, setProblem] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void rehydrateLanguage().then(() => setReady(true));
  }, []);
  // The object URL is let go when the photo is replaced or the page closes.
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const open = (file: File) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setPhoto({ url, width: image.naturalWidth, height: image.naturalHeight });
      setScalePoints([]);
      setMeasures([]);
      setTarget({ kind: 'scale' });
      setProblem('');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setProblem(t('画像として読み取れませんでした。', 'The file could not be read as a picture.'));
    };
    image.src = url;
  };

  const cmPerPixel =
    scalePoints.length === 2 && referenceCm !== null
      ? centimetresPerPixel(scalePoints[0]!, scalePoints[1]!, referenceCm)
      : null;
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !photo) return;
    const box = svg.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const point = {
      x: ((event.clientX - box.left) / box.width) * photo.width,
      y: ((event.clientY - box.top) / box.height) * photo.height,
    };
    if (target.kind === 'scale') setScalePoints((current) => (current.length >= 2 ? [point] : [...current, point]));
    else
      setMeasures((current) =>
        current.map((measure) =>
          measure.id === target.id ? { ...measure, points: [...measure.points, point] } : measure,
        ),
      );
  };

  const addMeasure = () => {
    const id = crypto.randomUUID();
    setMeasures((current) => [
      ...current,
      { id, name: t(`計測 ${current.length + 1}`, `Measure ${current.length + 1}`), points: [] },
    ]);
    setTarget({ kind: 'measure', id });
  };
  const undo = () => {
    if (target.kind === 'scale') setScalePoints((current) => current.slice(0, -1));
    else
      setMeasures((current) =>
        current.map((measure) =>
          measure.id === target.id ? { ...measure, points: measure.points.slice(0, -1) } : measure,
        ),
      );
  };

  const stroke = photo ? Math.max(photo.width, photo.height) / 400 : 1;
  const activeName =
    target.kind === 'scale'
      ? t('基準物の両端', 'the two ends of the reference')
      : (measures.find((measure) => measure.id === target.id)?.name ?? '');

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('antler-measure').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <ToolLayout
          resultLabel={t('計測結果', 'Measurements')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="photo" className="text-xl font-medium">
                {t('写真', 'Photo')}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {t(
                  '角や牙と同じ面に、長さの分かる物（定規など）を並べて、真正面から撮ります。',
                  'Lay something of known length (such as a ruler) in the same plane as the antlers or tusks, and shoot straight on.',
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) open(file);
                  }}
                />
                <Button variant="outline" onClick={() => inputRef.current?.click()}>
                  <LuImagePlus aria-hidden="true" />
                  {t('写真を選ぶ', 'Choose a photo')}
                </Button>
              </div>
              <CameraCapture
                language={language}
                onCapture={open}
                label={t('撮影する角', 'The antlers to photograph')}
              />
              {problem && <p className="text-sm text-destructive">{problem}</p>}
              {photo && (
                <div className="space-y-2">
                  <p className="text-sm font-medium" role="status">
                    {t(`写真をタップ：${activeName}`, `Tap the photo: ${activeName}`)}
                  </p>
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset */}
                    <img src={photo.url} alt={t('計測する写真', 'The photo being measured')} className="block w-full" />
                    <svg
                      ref={svgRef}
                      viewBox={`0 0 ${photo.width} ${photo.height}`}
                      className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                      onPointerDown={pick}
                      aria-hidden="true"
                    >
                      {scalePoints.length > 0 && (
                        <polyline
                          points={scalePoints.map((point) => `${point.x},${point.y}`).join(' ')}
                          fill="none"
                          stroke="#8430ce"
                          strokeWidth={stroke}
                        />
                      )}
                      {scalePoints.map((point, index) => (
                        <circle key={`s${index}`} cx={point.x} cy={point.y} r={stroke * 2} fill="#8430ce" />
                      ))}
                      {measures.map((measure) => (
                        <g key={measure.id}>
                          <polyline
                            points={measure.points.map((point) => `${point.x},${point.y}`).join(' ')}
                            fill="none"
                            stroke={target.kind === 'measure' && target.id === measure.id ? '#b3261e' : '#1a73e8'}
                            strokeWidth={stroke}
                          />
                          {measure.points.map((point, index) => (
                            <circle key={index} cx={point.x} cy={point.y} r={stroke * 1.5} fill="#1a73e8" />
                          ))}
                        </g>
                      ))}
                    </svg>
                  </div>
                  <Button variant="outline" size="sm" onClick={undo}>
                    <LuUndo2 aria-hidden="true" />
                    {t('最後の点を取り消す', 'Undo the last point')}
                  </Button>
                </div>
              )}
            </Card>
          }
          secondary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="scale" className="text-xl font-medium">
                {t('基準物', 'Reference')}
              </h2>
              <NumberField
                label={t('基準物の長さ', 'Reference length')}
                unit="cm"
                min={0}
                value={referenceCm ?? NaN}
                onChange={(value) => setReferenceCm(Number.isNaN(value) ? null : value)}
                invalid={referenceCm !== null && !(referenceCm > 0)}
                errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
              />
              <Button
                variant={target.kind === 'scale' ? 'default' : 'outline'}
                aria-pressed={target.kind === 'scale'}
                onClick={() => setTarget({ kind: 'scale' })}
                disabled={!photo}
              >
                {t('基準物の両端をタップする', 'Tap the two ends of the reference')}
              </Button>
              <p className="text-sm text-on-surface-variant">
                {cmPerPixel === null
                  ? t('縮尺：未設定', 'Scale: not set')
                  : t(
                      `縮尺：1 cm = ${number(1 / cmPerPixel, 1)} 画素`,
                      `Scale: 1 cm = ${number(1 / cmPerPixel, 1)} pixels`,
                    )}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="measures" className="text-xl font-medium">
                {t('計測結果', 'Measurements')}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {t(
                  '曲がった角は点を多く打つほど実際の長さに近づきます。',
                  'More points along a curved beam give a truer length.',
                )}
              </p>
              <ul className="space-y-2">
                {measures.map((measure, index) => {
                  const cm = measuredCentimetres(measure.points, cmPerPixel);
                  const active = target.kind === 'measure' && target.id === measure.id;
                  return (
                    <li
                      key={measure.id}
                      className={cn(
                        'space-y-2 rounded-sm border p-3',
                        active ? 'border-primary' : 'border-outline-variant',
                      )}
                    >
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <label htmlFor={`measure-${measure.id}`} className="block text-sm font-medium">
                            {t(`計測 ${index + 1} の名前`, `Name of measure ${index + 1}`)}
                          </label>
                          <input
                            id={`measure-${measure.id}`}
                            type="text"
                            value={measure.name}
                            maxLength={MAX_NAME}
                            onChange={(event) =>
                              setMeasures((current) =>
                                current.map((item) =>
                                  item.id === measure.id ? { ...item, name: event.target.value } : item,
                                ),
                              )
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t(`${measure.name} を削除`, `Remove ${measure.name}`)}
                          onClick={() => {
                            setMeasures((current) => current.filter((item) => item.id !== measure.id));
                            if (active) setTarget({ kind: 'scale' });
                          }}
                        >
                          <LuTrash2 aria-hidden="true" />
                        </Button>
                      </div>
                      <p className="text-xl font-medium tabular-nums">{cm === null ? '—' : `${number(cm, 1)} cm`}</p>
                      <Button
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={active}
                        onClick={() => setTarget({ kind: 'measure', id: measure.id })}
                        disabled={!photo}
                      >
                        {t('この計測に点を打つ', 'Tap points for this')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <Button variant="outline" onClick={addMeasure} disabled={!photo}>
                <LuPlus aria-hidden="true" />
                {t('計測を追加', 'Add a measure')}
              </Button>
              <p className="text-xs text-on-surface-variant">
                {t(
                  '基準物と奥行きが違う部分はずれ、カメラに対して斜めの部分は短く出ます。記録用の長さは巻尺で測ります。',
                  'Parts nearer or farther than the reference are off, and parts at an angle to the camera come out short. Use a tape for a record.',
                )}
              </p>
            </Card>
          }
        />
      </div>
    </AppLayout>
  );
}
