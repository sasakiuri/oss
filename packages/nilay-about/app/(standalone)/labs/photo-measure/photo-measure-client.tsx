'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuImage } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import type { Outline } from '@/lib/outline-model';
import {
  estimateBoarWeight,
  measurePathCm,
  polylineLength,
  principalExtent,
  scaleCmPerPixel,
} from '@/lib/photo-measure';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, usePhotoMeasureStore, type PointerMode, type Sex, type Subject } from './_store';
import { MeasureCanvas } from './measure-canvas';
import { OutlinePanel } from './outline-panel';

/** Without a photo the canvas keeps this shape, so the page does not jump when one is chosen. */
const placeholderSize = { width: 1200, height: 900 };

export function PhotoMeasureClient() {
  const store = usePhotoMeasureStore();
  const {
    imageSize,
    referenceA,
    referenceB,
    referenceCm,
    body,
    antlers,
    prompts,
    mode,
    subject,
    sex,
    setImage,
    setReferenceCm,
    setSubject,
    setSex,
    setMode,
    pick,
    setBody,
    undo,
    clearMode,
    startAntler,
  } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlineReady, setOutlineReady] = useState(false);
  const [foreground, setForeground] = useState(true);
  const urlRef = useRef<string | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([usePhotoMeasureStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const choosePhoto = (file: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null);
    setPhotoFailed(false);
    setOutline(null);
    setImage(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    const element = new Image();
    element.onload = () => {
      if (urlRef.current !== url) return;
      setPhoto(element);
      setImage({ width: element.naturalWidth, height: element.naturalHeight });
    };
    element.onerror = () => {
      if (urlRef.current === url) setPhotoFailed(true);
    };
    element.src = url;
  };

  const handleOutline = useCallback((next: Outline | null) => setOutline(next), []);

  const number = (value: number, digits = 1) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';

  const referenceInvalid = !Number.isFinite(referenceCm) || referenceCm <= 0;
  const scale =
    referenceA && referenceB && !referenceInvalid ? scaleCmPerPixel(referenceA, referenceB, referenceCm) : null;
  const bodyCm = measurePathCm(body, scale);
  const antlerRows = antlers
    .map((path, index) => ({ index, cm: measurePathCm(path, scale) }))
    .filter((row) => antlers[row.index]!.length > 0);
  const extent = outline ? principalExtent(outline.mask, outline.fit.width, outline.fit.height) : null;
  const outlineCm = extent && scale !== null ? (extent.lengthPx / outline!.fit.scale) * scale : null;
  const weight = subject === 'boar' && bodyCm !== null ? estimateBoarWeight(bodyCm, sex) : null;

  const size = imageSize ?? placeholderSize;
  const referencePx = referenceA && referenceB ? polylineLength([referenceA, referenceB]) : NaN;

  const modeOptions: { value: PointerMode; label: string }[] = [
    { value: 'referenceA', label: t('基準 A', 'Ref. A') },
    { value: 'referenceB', label: t('基準 B', 'Ref. B') },
    { value: 'body', label: t('体長', 'Body') },
    { value: 'antler', label: t('角', 'Antler') },
    ...(outlineReady ? [{ value: 'outline' as const, label: t('輪郭', 'Outline') }] : []),
  ];
  const modeHint: Record<PointerMode, string> = {
    referenceA: t(
      '物差しなど長さのわかる物の一端に置きます（ドラッグで動かせます）。',
      'Place it on one end of the ruler or other object of known length (drag to move).',
    ),
    referenceB: t('同じ物のもう一端に置きます。', 'Place it on the other end of the same object.'),
    body: t(
      '鼻先から順に、背に沿って肛門までタップします。尾の付け根ではなく肛門です。まっすぐなら 2 点で足ります。',
      'Tap from the tip of the snout along the back to the anus, not the base of the tail. Two points will do if the body is straight.',
    ),
    antler: t(
      '角の付け根から先端まで、曲がりに沿ってタップします。次の角は「次の角」を押してから。',
      'Tap along the curve from the base of the antler to its tip. Press “Next antler” before the next one.',
    ),
    outline: t('動物をタップすると輪郭を取ります。', 'Tap the animal to outline it.'),
  };

  const reset = () => {
    choosePhoto(null);
    usePhotoMeasureStore.getState().reset();
  };

  const bodyLabel = t('体長（鼻先〜肛門）', 'Head and body length');

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('photo-measure').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '写真・基準・置いた点と設定を初期値に戻します。保存したモデルは残ります。',
                  en: 'Clears the photo, the reference, the points and the settings. A saved model is kept.',
                }}
                onReset={reset}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          proportions="workspace"
          resultLabel={t('計測結果', 'Measurements')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="photo" className="text-xl font-medium">
                {t('写真と計測', 'Photo and measuring')}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {t(
                  '物差しなど長さのわかる物を、動物の体の横に同じ距離で置き、真横から撮ります。',
                  'Lay a ruler or another object of known length beside the animal, at the same distance from the camera, and photograph it square on.',
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {/* The native input's wording follows the browser's language, so the label is the button. */}
                <input
                  id="photo-file"
                  type="file"
                  accept="image/*"
                  className="peer sr-only"
                  onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
                />
                <label
                  htmlFor="photo-file"
                  className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                >
                  <LuImage aria-hidden="true" className="size-[18px]" />
                  {t('写真を選ぶ', 'Choose a photo')}
                </label>
              </div>
              <p role="status" className="text-sm">
                {photoFailed
                  ? t(
                      '画像を読み込めませんでした。別の写真を選んでください。',
                      'Could not read the image. Choose another photo.',
                    )
                  : imageSize
                    ? t(
                        `写真を読み込みました（${imageSize.width} × ${imageSize.height} ピクセル）。`,
                        `Photo loaded (${imageSize.width} × ${imageSize.height} pixels).`,
                      )
                    : t('写真なし', 'No photo')}
              </p>
              <SegmentedControl
                legend={t('タップで置くもの', 'A tap places')}
                orientation="inline"
                value={mode}
                onChange={(value) => setMode(value as PointerMode)}
                options={modeOptions}
              />
              <p id="photo-measure-hint" className="text-sm text-on-surface-variant">
                {modeHint[mode]}
              </p>
              <MeasureCanvas
                photo={photo}
                imageSize={size}
                referenceA={referenceA}
                referenceB={referenceB}
                body={body}
                antlers={antlers}
                prompts={prompts}
                outline={outline}
                mode={mode}
                onPick={(point) => {
                  if (imageSize) pick(point, foreground);
                }}
                onRelease={() => {
                  if (mode === 'referenceA' && !referenceB) setMode('referenceB');
                }}
                label={t('計測する写真', 'The photo being measured')}
                describedBy="photo-measure-hint"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={undo} disabled={mode === 'referenceA' || mode === 'referenceB'}>
                  {t('1 点戻す', 'Undo a point')}
                </Button>
                <Button variant="ghost" onClick={clearMode}>
                  {mode === 'body'
                    ? t('体長の点を消す', 'Clear the body points')
                    : mode === 'antler'
                      ? t('角の点を消す', 'Clear the antler points')
                      : mode === 'outline'
                        ? t('輪郭のタップを消す', 'Clear the outline taps')
                        : t('基準の点を消す', 'Clear the reference')}
                </Button>
                {mode === 'antler' && (
                  <Button variant="ghost" onClick={startAntler}>
                    {t('次の角', 'Next antler')}
                  </Button>
                )}
              </div>
              <NumberField
                label={t('基準 A–B の実寸', 'Real length A–B')}
                unit="cm"
                value={referenceCm}
                onChange={setReferenceCm}
                min={0}
                invalid={referenceInvalid}
                errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
              />
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('計測結果', 'Measurements')}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={bodyLabel}
                  value={bodyCm !== null ? number(bodyCm) : '—'}
                  unit={bodyCm !== null ? 'cm' : undefined}
                />
                {antlerRows.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-4">
                    {antlerRows.map((row, position) => (
                      <ResultFigure
                        key={row.index}
                        label={t(`角 ${position + 1}`, `Antler ${position + 1}`)}
                        value={row.cm !== null ? number(row.cm) : '—'}
                        unit={row.cm !== null ? 'cm' : undefined}
                      />
                    ))}
                  </div>
                )}
                {outline && (
                  <div className="space-y-2 border-t border-outline-variant pt-4">
                    <ResultFigure
                      label={t('輪郭の長軸の長さ', 'Outline along its long axis')}
                      value={outlineCm !== null ? number(outlineCm) : '—'}
                      unit={outlineCm !== null ? 'cm' : undefined}
                      note={t('尾・脚・頭の向きで変わります', 'Changes with the tail, legs and head')}
                    />
                    {extent && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setBody([
                            { x: extent.start.x / outline.fit.scale, y: extent.start.y / outline.fit.scale },
                            { x: extent.end.x / outline.fit.scale, y: extent.end.y / outline.fit.scale },
                          ])
                        }
                      >
                        {t('両端を体長の点にする', 'Use its ends as the body points')}
                      </Button>
                    )}
                  </div>
                )}
              </ResultPanel>
              <p className="text-sm text-on-surface-variant">
                {scale === null
                  ? t('縮尺：未設定', 'Scale: not set')
                  : t(
                      `基準は写真上 ${number(referencePx, 0)} px、1 px = ${number(scale * 10, 3)} mm。`,
                      `Reference ${number(referencePx, 0)} px on the photo, ${number(scale * 10, 3)} mm per pixel.`,
                    )}
              </p>

              <div className="space-y-4 border-t border-outline-variant pt-4">
                <h3 className="text-base font-medium">{t('体重の目安', 'Weight estimate')}</h3>
                <SegmentedControl
                  legend={t('動物', 'Animal')}
                  orientation="inline"
                  value={subject}
                  onChange={(value) => setSubject(value as Subject)}
                  options={[
                    { value: 'boar', label: t('イノシシ', 'Wild boar') },
                    { value: 'deer', label: t('シカ', 'Sika deer') },
                    { value: 'other', label: t('その他', 'Other') },
                  ]}
                />
                {subject === 'boar' && (
                  <SegmentedControl
                    legend={t('性別', 'Sex')}
                    orientation="inline"
                    value={sex}
                    onChange={(value) => setSex(value as Sex)}
                    options={[
                      { value: 'male', label: t('オス', 'Male') },
                      { value: 'female', label: t('メス', 'Female') },
                    ]}
                  />
                )}
                {subject === 'boar' ? (
                  <>
                    <ResultFigure
                      label={t('内臓を除いた体重', 'Weight without the viscera')}
                      value={weight ? number(weight.kg) : '—'}
                      unit={weight ? 'kg' : undefined}
                      note={
                        weight &&
                        t(
                          `標準誤差の幅で ${number(weight.lowKg)}〜${number(weight.highKg)} kg`,
                          `${number(weight.lowKg)}–${number(weight.highKg)} kg within one standard error`,
                        )
                      }
                    />
                    <p className="text-sm text-on-surface-variant">
                      {bodyCm === null
                        ? null
                        : weight === null
                          ? t(
                              `論文で測られた体長（${sex === 'male' ? '60〜151' : '60〜135'} cm）の範囲外のため、出しません。`,
                              `Not given: outside the lengths the paper measured (${sex === 'male' ? '60–151' : '60–135'} cm).`,
                            )
                          : t(
                              '安部（1986）の回帰式による値です。生体重はこれより重くなります。',
                              'From the regression of Abe (1986). A live animal weighs more.',
                            )}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    {t('体重はイノシシだけ出します。', 'A weight is given for wild boar only.')}
                  </p>
                )}
              </div>
            </Card>
          }
          secondary={
            <ConditionSection
              id="outline"
              title={t('AI で輪郭を取る（任意）', 'Outline with AI (optional)')}
              summary={
                outlineReady
                  ? t('端末内のモデルを使用中', 'Using the on-device model')
                  : t('モデルは未ダウンロード', 'Model not loaded')
              }
            >
              <OutlinePanel
                language={language}
                photo={photo}
                prompts={prompts}
                foreground={foreground}
                onForegroundChange={setForeground}
                active={mode === 'outline'}
                onActivate={() => {
                  setOutlineReady(true);
                  setMode('outline');
                }}
                onDeactivate={() => {
                  setOutlineReady(false);
                  if (mode === 'outline') setMode('body');
                }}
                onOutline={handleOutline}
              />
            </ConditionSection>
          }
          extras={
            <ConditionSection
              id="notes"
              title={t('精度の限界と出典', 'Limits and sources')}
              summary={t('安部（1986）、SlimSAM-77', 'Abe (1986), SlimSAM-77')}
            >
              <ul className="space-y-2 text-sm text-on-surface-variant">
                <li>
                  {t(
                    '縮尺が合うのは基準と同じ距離・同じ面の部分だけです。基準が動物より手前なら長く、奥なら短く出ます。真横から、離れてズームで撮るほど誤差が減ります。',
                    'The scale holds only at the distance and in the plane of the reference. A reference nearer the camera than the animal reads long, one further away short. Shoot square to the body, from further away with zoom.',
                  )}
                </li>
                <li>
                  {t(
                    '写真の端はレンズのゆがみで伸び縮みします。動物と基準は写真の中央付近に写してください。',
                    'Lens distortion stretches the edges of a photo. Keep the animal and the reference near the middle.',
                  )}
                </li>
                <li>
                  {t(
                    '輪郭には脚・尾・背景が入ったり欠けたりします。',
                    'The outline can take in or leave out legs, tail or background.',
                  )}
                </li>
                <li>
                  {t(
                    '角の長さは写真の面に投影した長さです。カメラの方へ曲がった部分は短く出ます。',
                    'Antler lengths are as projected onto the photo. Parts curving towards the camera read short.',
                  )}
                </li>
                <li>
                  {t(
                    'イノシシの体重は、安部みき子（1986）「ニホンイノシシの外部計測値―体重ならびに頭胴長の回帰と相対成長―」哺乳動物学雑誌 11(3-4): 147–154 の回帰式（log 体重 = 3.38 log 頭胴長 − 5.34〔オス〕、3.35 log 頭胴長 − 5.30〔メス〕、常用対数、kg・cm）によります。1975〜76 年の猟期に兵庫県・京都府を中心に捕獲された個体（体重はオス 53・メス 44 頭）を、下あごで吊るして巻尺で測ったもので、体重は内臓を除いた値です。論文の 1 例では内臓が体重の 20.7% でした。確認日: 2026-09-24。',
                    'The boar weight uses the regressions of Abe (1986), Journal of the Mammalogical Society of Japan 11(3-4): 147–154 (log weight = 3.38 log head-and-body length − 5.34 for males, 3.35 log length − 5.30 for females; common logarithms, kg and cm). The boars were taken mainly in Hyogo and Kyoto in the 1975–76 season (53 males and 44 females weighed), measured with a tape while hung by the lower jaw, and weighed with the viscera removed; in the one animal whose organs were weighed they were 20.7% of its weight. Checked 2026-09-24.',
                  )}{' '}
                  <a
                    className="text-primary underline"
                    href="https://doi.org/10.11238/jmammsocjapan1952.11.147"
                    target="_blank"
                    rel="noreferrer"
                  >
                    doi:10.11238/jmammsocjapan1952.11.147
                  </a>
                </li>
                <li>
                  {t(
                    '輪郭のモデル: SlimSAM-77（Chen ほか 2023, arXiv:2312.05284）を ONNX 形式に変換した Xenova/slimsam-77-uniform の 8 ビット版。Apache License 2.0。',
                    'Outline model: the 8-bit ONNX export of SlimSAM-77 (Chen et al. 2023, arXiv:2312.05284) published as Xenova/slimsam-77-uniform. Apache License 2.0.',
                  )}
                </li>
              </ul>
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
