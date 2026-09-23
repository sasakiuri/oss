'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuImage, LuPlus, LuScanSearch, LuTrash2, LuUndo2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  CameraCapture,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  ResetButton,
  StorageUnavailableNotice,
  ResultFigure,
  ResultPanel,
  SectionNav,
  SegmentedControl,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { detectHoles, thresholdFor } from '@/lib/hole-detection';
import { readImagePixels } from '@/lib/image-pixels';
import { labsTool } from '@/lib/labs-tools';
import {
  PATTERN_DIAMETER_CM,
  distanceBetween,
  summarisePattern,
  toOffsetCm,
  type ShotOffset,
} from '@/lib/shot-pattern';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { RoundedNumberField } from '../shot-group/fields';

import { selectScale, storageKey, useShotPatternStore, type ImageSize } from './_store';
import { PatternCanvas, type PointerMode } from './pattern-canvas';
import { SavedMeasurements } from './saved-measurements';

/** A typical lead pellet. */
const DEFAULT_PELLET_DIAMETER_MM = 3;
/** Detection searches a quarter of the radius beyond the circle, so misses near the rim are counted. */
const SEARCH_MARGIN = 1.25;

export function ShotPatternClient() {
  const state = useShotPatternStore();
  const {
    imageSize,
    calibration,
    centre,
    diameterCm,
    pellets,
    shots,
    records,
    setImage,
    setCalibrationPoint,
    setReferenceCm,
    setCentre,
    setDiameterCm,
    addShot,
    addShotAtOffset,
    replaceShots,
    removeShot,
    undoShot,
    clearShots,
    setPellets,
    reset,
  } = state;
  const language = useLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  // imageSize still describes the previous photo until the new one decodes.
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [mode, setMode] = useState<PointerMode>('shot');
  const [offsetDraft, setOffsetDraft] = useState({ x: '', y: '' });
  // The event, not its sentence, so the wording follows a language change.
  const [message, setMessage] = useState<
    { kind: 'restarted' } | { kind: 'unusable-offset' } | { kind: 'added'; offset: ShotOffset } | null
  >(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // State rather than a ref: detection is offered only once the photo has decoded.
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [pelletDiameterMm, setPelletDiameterMm] = useState<number | null>(DEFAULT_PELLET_DIAMETER_MM);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<
    | { kind: 'unreadable' }
    | { kind: 'not-ready' }
    | { kind: 'found'; found: number; tooSmall: number; tooLarge: number; tooRagged: number; overCap: number }
    | null
  >(null);

  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  // A photo that failed to decode is gone even though its frame stays, so this follows the object URL.
  const hasImage = imageUrl !== null;
  const scale = selectScale(state);
  const pixelSpan = distanceBetween(calibration.a, calibration.b);
  const offsets = scale === null ? null : shots.map((shot) => toOffsetCm(shot, centre, scale));
  const summary = summarisePattern(offsets ?? [], { diameterCm, pellets });
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });
  const length = (value: number) => (Number.isFinite(value) && value > 0 ? number.format(value) : '—');
  // Without a circle every shot would count as outside, so nothing is counted.
  const circleSet = diameterCm > 0;
  const measurable = scale !== null && circleSet;
  const count = (value: number) => (measurable ? number.format(value) : '—');
  const patternText =
    measurable && summary.patternPercentage !== null ? percent.format(summary.patternPercentage / 100) : '—';

  useEffect(() => {
    void Promise.all([useShotPatternStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const choosePhoto = (file: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = file ? URL.createObjectURL(file) : null;
    setPhoto(null);
    setDetection(null);
    setImageFailed(false);
    setLoadingPhoto(file !== null);
    setImageUrl(urlRef.current);
    if (!file) setImage(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const handleImageLoad = useCallback(
    (decoded: HTMLImageElement) => {
      setPhoto(decoded);
      const size: ImageSize = { width: decoded.naturalWidth, height: decoded.naturalHeight };
      setImage(size);
      setImageFailed(false);
      setLoadingPhoto(false);
    },
    [setImage],
  );
  const handleImageError = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null);
    setImageFailed(true);
    setLoadingPhoto(false);
    setImageUrl(null);
    // The shots were already confirmed as discarded, so clear them even when the photo fails.
    setImage(null);
  }, [setImage]);

  const discarded = useDiscardedSave(storageKey);
  const summarySentence =
    shots.length === 0
      ? ''
      : scale === null
        ? t('実寸の基準が未設定のため、集計できません。', 'The scale is not set, so nothing is counted.')
        : !circleSet
          ? t('円の直径が未設定のため、集計できません。', 'The circle diameter is not set, so nothing is counted.')
          : t(
              `円内の着弾 ${count(summary.inside)} 点、打点の総数 ${number.format(shots.length)} 点。`,
              `${count(summary.inside)} of ${number.format(shots.length)} shots inside the circle.`,
            ) +
            (summary.patternPercentage === null ? '' : t(`パターン率 ${patternText}。`, ` Pattern ${patternText}.`));
  const announcement = summarySentence;
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    if (!ready) return;
    // Announce only once typing settles.
    const timer = window.setTimeout(() => setSpoken(announcement), 700);
    return () => window.clearTimeout(timer);
  }, [ready, announcement]);

  const confirmPhotoChange = () =>
    shots.length === 0 ||
    window.confirm(
      t('写真を変えると、記録した打点はすべて消えます。続けますか？', 'Changing the photo clears all shots. Continue?'),
    );

  const holeDiameterPx =
    scale !== null && pelletDiameterMm !== null && pelletDiameterMm > 0 ? pelletDiameterMm / 10 / scale : null;
  const canDetect = hasImage && photo !== null && holeDiameterPx !== null && diameterCm > 0 && !detecting;

  const runDetection = () => {
    if (!photo || scale === null || holeDiameterPx === null || !(diameterCm > 0)) {
      setDetection({ kind: 'not-ready' });
      return;
    }
    if (
      shots.length > 0 &&
      !window.confirm(t('現在の打点を検出結果で置き換えますか？', 'Replace the current shots with the detected ones?'))
    )
      return;
    setDetection(null);
    setDetecting(true);
    // Start after the "analysing" notice has painted: the search blocks the main thread on a large photo.
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        try {
          const pixels = readImagePixels(photo);
          if (!pixels) {
            setDetection({ kind: 'unreadable' });
            return;
          }
          const radiusPx = diameterCm / 2 / scale;
          const result = detectHoles(pixels.image, {
            region: {
              x: centre.x * pixels.scaleX,
              y: centre.y * pixels.scaleY,
              radius: radiusPx * SEARCH_MARGIN * pixels.scaleX,
            },
            holeDiameterPx: holeDiameterPx * pixels.scaleX,
            sensitivity,
            // Pellet holes in a pattern board read darker than the paper.
            polarity: 'darker',
          });
          replaceShots(result.holes.map((hole) => ({ x: hole.x / pixels.scaleX, y: hole.y / pixels.scaleY })));
          setDetection({ kind: 'found', found: result.holes.length, ...result.rejected });
        } finally {
          setDetecting(false);
        }
      }, 0),
    );
  };

  const detectionText = () => {
    if (detecting) return t('解析中…', 'Analysing…');
    if (detection === null) return '';
    if (detection.kind === 'unreadable')
      return t(
        '写真を読み取れませんでした。別の写真を選んでください。',
        'Could not read the photo. Choose another one.',
      );
    if (detection.kind === 'not-ready')
      return t(
        '写真・実寸の基準・円の直径・粒の直径を設定してください。',
        'Load a photo and set the scale, circle diameter and pellet diameter.',
      );
    const skipped = detection.tooSmall + detection.tooLarge + detection.tooRagged;
    return (
      t(
        `${number.format(detection.found)} 点を検出し、打点を置き換えました。`,
        `Detected ${number.format(detection.found)} shots.`,
      ) +
      (skipped === 0
        ? ''
        : t(
            `大きさや形が合わない ${number.format(skipped)} 件を除外しました。`,
            ` Excluded ${number.format(skipped)} marks of the wrong size or shape.`,
          )) +
      (detection.overCap === 0
        ? ''
        : t(
            `数が多すぎたため、小さい ${number.format(detection.overCap)} 件も除外しました。`,
            ` ${number.format(detection.overCap)} smaller marks were dropped because there were too many.`,
          )) +
      t(
        '過不足は作業エリアを押して追加するか、打点の一覧から削除します。',
        ' To correct the count, tap the workspace to add a shot or delete one from the shot list.',
      )
    );
  };

  const modes: { value: PointerMode; label: string }[] = [
    { value: 'shot', label: t('打点', 'Shots') },
    { value: 'centre', label: t('円', 'Circle') },
    { value: 'scaleA', label: t('基準点 A', 'Point A') },
    { value: 'scaleB', label: t('基準点 B', 'Point B') },
  ];
  const modeHint = {
    shot: t('粒の痕を押して打点を追加します。', 'Tap a pellet hole to add a shot.'),
    centre: t(
      '押した点へ円の中心が移動します。ドラッグでも動かせます。',
      'Tap to move the circle centre, or drag the circle.',
    ),
    scaleA: t('実寸のわかる 2 点の 1 点目を押します。', 'Tap the first of two points a known distance apart.'),
    scaleB: t('実寸のわかる 2 点の 2 点目を押します。', 'Tap the second of the two points.'),
  }[mode];
  const pick = (point: { x: number; y: number }) => {
    if (mode === 'shot') addShot(point);
    else if (mode === 'centre') setCentre(point);
    else setCalibrationPoint(mode === 'scaleA' ? 'a' : 'b', point);
  };
  const positionError = (value: number) =>
    Number.isFinite(value) ? undefined : t('座標を数値で入力してください。', 'Enter the coordinate as a number.');
  const offsetText = (offset: ShotOffset | undefined) =>
    offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)
      ? `${horizontal(offset.x)} cm / ${vertical(offset.y)} cm`
      : '—';
  const vertical = (value: number) =>
    `${value >= 0 ? t('上', 'up') : t('下', 'down')} ${number.format(Math.abs(value))}`;
  const horizontal = (value: number) =>
    `${value >= 0 ? t('右', 'right') : t('左', 'left')} ${number.format(Math.abs(value))}`;

  const messageText = () => {
    if (message === null) return '';
    if (message.kind === 'restarted') return t('最初からやり直しました。', 'Started over.');
    if (message.kind === 'unusable-offset')
      return t(
        '座標を数値で入力し、実寸の基準を設定してください。',
        'Enter both coordinates as numbers and set the scale.',
      );
    const { x, y } = message.offset;
    return t(
      `${horizontal(x)} cm、${vertical(y)} cm に打点を追加しました。`,
      `Added a shot at ${horizontal(x)} cm, ${vertical(y)} cm.`,
    );
  };

  const pelletsInvalid = pellets !== null && !(Number.isInteger(pellets) && pellets > 0);
  const pelletDiameterInvalid = pelletDiameterMm !== null && !(pelletDiameterMm > 0);
  const calibrationInvalid = (['a', 'b'] as const).some(
    (key) => !Number.isFinite(calibration[key].x) || !Number.isFinite(calibration[key].y),
  );
  const centreInvalid = !Number.isFinite(centre.x) || !Number.isFinite(centre.y);
  const scaleSummary =
    scale === null
      ? t('基準が未設定です。', 'Scale not set.')
      : // The pixel figures are inside the section; closed, it states the length it assumes.
        `A–B ${number.format(calibration.referenceCm)} cm`;
  const circleSummary = circleSet
    ? t(
        `直径 ${number.format(diameterCm)} cm ・ ${pellets === null || pelletsInvalid ? '総粒数 未入力' : `総粒数 ${number.format(pellets)}`}`,
        `${number.format(diameterCm)} cm across · ${pellets === null || pelletsInvalid ? 'no pellet count' : `${number.format(pellets)} pellets`}`,
      )
    : t('直径 未入力', 'No circle diameter');

  const notes = [
    t(
      '自動検出は粒の大きさの丸い暗い痕を数えるだけです。重なった痕は 1 つに数え、汚れや印刷も拾います。結果はボードと見比べてください。',
      'Detection only counts round dark marks the size of a pellet hole. Overlapping holes count as one, and dirt or printing can be picked up. Check the result against the board.',
    ),
    t(
      '撮影角度・レンズの歪み・ボードのたわみは誤差になります。ボードを平らに張り、正面から撮影してください。',
      'Camera angle, lens distortion and a board that is not flat add error. Keep the board flat and photograph it straight on.',
    ),
    t(
      '同じ銃・チョーク・実包・距離で複数回撃って比べてください。',
      'Compare several shots with the same gun, choke, load and distance.',
    ),
  ];

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'step-1-photo', label: t('1. 写真', '1. Photo') },
            { id: 'step-2-scale', label: t('2. 実寸', '2. Scale') },
            { id: 'step-3-circle', label: t('3. 円と粒数', '3. Circle & pellets') },
            { id: 'step-4-shots', label: t('4. 着弾', '4. Shots') },
            { id: 'step-5-result', label: t('5. 結果', '5. Result') },
            { id: 'step-6-records', label: t('6. 記録', '6. Records') },
            { id: 'notes', label: t('撮影と検出', 'Photos') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('shot-pattern').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '写真・縮尺・中心・打点・入力した条件を消します。保存した測定は残ります。',
                  en: 'Clears the photo, scale, centre, shots and settings. Saved measurements are kept.',
                }}
                // The photo is component state, so it is cleared here as well as the store.
                onReset={() => {
                  choosePhoto(null);
                  reset();
                  setMessage({ kind: 'restarted' });
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty from the first paint so changes are announced. Separate regions, because
          role="status" is atomic and a shared one would repeat the notice on every summary change. */}
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {spoken}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          proportions="workspace"
          resultLabel={t('集計結果', 'Pattern count')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="step-1-photo" className="text-xl font-medium">
                  {t('1. 写真を読み込む', '1. Load a photo')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '写真がなくても、座標を入力して測定できます。',
                    'Without a photo, enter the shots by coordinates.',
                  )}
                </p>
                <CameraCapture
                  language={language}
                  label={t('カメラのプレビュー', 'Camera preview')}
                  confirmCapture={confirmPhotoChange}
                  onCapture={(file) => choosePhoto(file)}
                />
                <div className="flex flex-wrap gap-2">
                  {/* The native input is hidden because its own wording follows the browser's language,
                        not the page's; the label is drawn as the button. */}
                  <input
                    ref={fileRef}
                    id="photo"
                    type="file"
                    accept="image/*"
                    className="peer sr-only"
                    onChange={(event) => {
                      if (!confirmPhotoChange()) {
                        event.target.value = '';
                        return;
                      }
                      choosePhoto(event.target.files?.[0] ?? null);
                    }}
                  />
                  <label
                    htmlFor="photo"
                    className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  >
                    <LuImage aria-hidden="true" className="size-[18px]" />
                    {t('写真を選ぶ', 'Choose a photo')}
                  </label>
                  {hasImage && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirmPhotoChange()) choosePhoto(null);
                      }}
                    >
                      {t('写真を外す', 'Remove photo')}
                    </Button>
                  )}
                </div>
                <p role="status" className="text-sm">
                  {imageFailed
                    ? t(
                        '画像を読み込めませんでした。別の写真を選んでください。',
                        'Could not read the image. Choose another photo.',
                      )
                    : loadingPhoto
                      ? t('写真を読み込み中…', 'Loading the photo…')
                      : hasImage
                        ? t(
                            `写真を読み込みました（${imageSize.width} × ${imageSize.height} ピクセル）。`,
                            `Photo loaded (${imageSize.width} × ${imageSize.height} pixels).`,
                          )
                        : t('写真なし', 'No photo')}
                </p>
              </Card>

              {/* A new photo resets the reference points, so the step opens for it. */}
              <ConditionSection
                key={imageUrl ?? 'no-photo'}
                id="step-2-scale"
                title={t('2. 実寸を合わせる', '2. Set the scale')}
                summary={scaleSummary}
                defaultOpen={hasImage}
                forceOpen={scale === null || calibrationInvalid}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '作業エリアで A・B を長さのわかる 2 点に置き、その長さを入力します。',
                    'In the workspace, place A and B on two points a known distance apart and enter that distance.',
                  )}
                </p>
                <RoundedNumberField
                  className="sm:max-w-xs"
                  fieldId="reference"
                  label={t('基準点 A–B の実寸', 'Real distance between A and B')}
                  unit="cm"
                  min={0}
                  value={calibration.referenceCm}
                  onChange={(value) => setReferenceCm(value ?? NaN)}
                  invalid={scale === null}
                  errorText={t(
                    '0 より大きい長さを入力し、A と B を離して置いてください。',
                    'Enter a length greater than zero and keep A and B apart.',
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  {(['a', 'b'] as const).map((key) =>
                    (['x', 'y'] as const).map((axis) => (
                      <RoundedNumberField
                        key={`${key}${axis}`}
                        fieldId={`point-${key}-${axis}`}
                        label={
                          axis === 'x'
                            ? t(
                                `基準点 ${key.toUpperCase()}：左端からの距離`,
                                `Point ${key.toUpperCase()}: from the left edge`,
                              )
                            : t(
                                `基準点 ${key.toUpperCase()}：上端からの距離`,
                                `Point ${key.toUpperCase()}: from the top edge`,
                              )
                        }
                        unit="px"
                        min={0}
                        value={calibration[key][axis]}
                        onChange={(value) => setCalibrationPoint(key, { ...calibration[key], [axis]: value ?? NaN })}
                        invalid={positionError(calibration[key][axis]) !== undefined}
                        errorText={positionError(calibration[key][axis])}
                      />
                    )),
                  )}
                </div>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '座標は写真の左上からのピクセル数です。',
                    'Coordinates are pixels from the top left of the photo.',
                  )}
                </p>
                <dl className="grid grid-cols-2 gap-3 rounded-sm bg-surface-container p-4">
                  <div>
                    <dt className="text-sm">{t('A–B の画面上の長さ', 'A–B on the image')}</dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums">
                      {Number.isFinite(pixelSpan) ? `${number.format(pixelSpan)} px` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm">{t('1 ピクセルあたり', 'Per pixel')}</dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums">
                      {scale === null
                        ? '—'
                        : `${new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(scale)} cm`}
                    </dd>
                  </div>
                </dl>
              </ConditionSection>

              {/* Open from the start: the pellet count gives the percentage and is not kept between visits. */}
              <ConditionSection
                id="step-3-circle"
                title={t('3. 円と総粒数', '3. Circle and pellet count')}
                summary={circleSummary}
                defaultOpen
                forceOpen={!circleSet || pelletsInvalid || centreInvalid}
              >
                <div className="grid grid-cols-2 gap-4">
                  <RoundedNumberField
                    fieldId="diameter"
                    label={t('円の直径', 'Circle diameter')}
                    unit="cm"
                    min={0}
                    value={diameterCm}
                    onChange={(value) => setDiameterCm(value ?? NaN)}
                    hint={t(
                      `標準は ${PATTERN_DIAMETER_CM} cm（30 インチ）。`,
                      `Standard: ${PATTERN_DIAMETER_CM} cm (30 inches).`,
                    )}
                    invalid={!circleSet}
                    errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                  />
                  <RoundedNumberField
                    fieldId="pellets"
                    label={t('装弾の総粒数', 'Pellets in the shell')}
                    value={pellets}
                    digits={0}
                    step={1}
                    min={1}
                    onChange={(value) =>
                      setPellets(value !== null && Number.isFinite(value) ? Math.round(value) : null)
                    }
                    hint={t('任意。パターン率に使います。', 'Optional. Gives the pattern percentage.')}
                    invalid={pelletsInvalid}
                    errorText={t('1 以上の整数で入力してください。', 'Enter a whole number of 1 or more.')}
                  />
                </div>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '円は着弾の最も密な部分に重ねます。作業エリアでドラッグするか、座標で動かします。',
                    'Place the circle over the densest part of the pattern by dragging it or with the coordinates.',
                  )}
                </p>
                {scale !== null && (
                  <div className="grid grid-cols-2 gap-4">
                    <RoundedNumberField
                      fieldId="centre-x"
                      label={t('中心：左端からの距離', 'Centre: from the left edge')}
                      unit="cm"
                      value={centre.x * scale}
                      onChange={(value) => setCentre({ ...centre, x: (value ?? NaN) / scale })}
                      invalid={positionError(centre.x) !== undefined}
                      errorText={positionError(centre.x)}
                    />
                    <RoundedNumberField
                      fieldId="centre-y"
                      label={t('中心：上端からの距離', 'Centre: from the top edge')}
                      unit="cm"
                      value={centre.y * scale}
                      onChange={(value) => setCentre({ ...centre, y: (value ?? NaN) / scale })}
                      invalid={positionError(centre.y) !== undefined}
                      errorText={positionError(centre.y)}
                    />
                  </div>
                )}
              </ConditionSection>

              <Card variant="outlined" className="flex flex-col gap-4 rounded-md p-5 sm:p-6">
                <h2 id="step-4-shots" className="text-xl font-medium">
                  {t('4. 着弾を数える', '4. Record the shots')}
                </h2>
                <div className="space-y-2">
                  <SegmentedControl
                    legend={t('作業エリアを押して置くもの', 'Tap to place')}
                    orientation="inline"
                    value={mode}
                    onChange={(value) => setMode(value as PointerMode)}
                    options={modes}
                  />
                  <p className="text-xs text-on-surface-variant">{modeHint}</p>
                </div>
                <div>
                  <PatternCanvas
                    imageUrl={imageUrl}
                    imageSize={imageSize}
                    calibration={calibration}
                    centre={centre}
                    diameterCm={diameterCm}
                    cmPerPixel={scale}
                    shots={shots}
                    mode={mode}
                    onPick={pick}
                    onImageLoad={handleImageLoad}
                    onImageError={handleImageError}
                    label={t(
                      `パターンボードの作図。直径 ${length(diameterCm)} cm の円と、${shots.length} 点の着弾。`,
                      `Pattern board drawing: a ${length(diameterCm)} cm circle with ${shots.length} shots.`,
                    )}
                    describedBy="workspace-caption"
                  />
                </div>
                {/* Detection first: with a photo it counts the board in one step, and taps then correct it. */}
                <div className="flex flex-wrap gap-2">
                  <Button variant={hasImage ? 'default' : 'outline'} disabled={!canDetect} onClick={runDetection}>
                    <LuScanSearch aria-hidden="true" />
                    {detecting ? t('検出中…', 'Detecting…') : t('写真から自動で検出', 'Detect shots')}
                  </Button>
                  <Button variant="outline" disabled={shots.length === 0} onClick={undoShot}>
                    <LuUndo2 aria-hidden="true" />
                    {t('直前を取り消す', 'Undo last shot')}
                  </Button>
                  <Button variant="ghost" disabled={shots.length === 0} onClick={clearShots}>
                    <LuTrash2 aria-hidden="true" />
                    {t('打点をすべて消す', 'Clear all shots')}
                  </Button>
                </div>
                {!canDetect && !detecting && (
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      '自動検出には写真・実寸の基準・円の直径・粒の直径が必要です。',
                      'Detection needs a photo, the scale, the circle diameter and the pellet diameter.',
                    )}
                  </p>
                )}
                {/* Mounted empty so changes are announced; sr-only while empty so the gap takes no row. */}
                <p role="status" className={detecting || detection ? 'text-sm' : 'sr-only'}>
                  {detectionText()}
                </p>
                <p role="status" className={message ? 'text-sm' : 'sr-only'}>
                  {messageText()}
                </p>
                <p id="workspace-caption" className="text-xs text-on-surface-variant">
                  {t(
                    `紫の A・B：実寸の基準。青の円：直径 ${length(diameterCm)} cm。破線：面積を 2 等分する内円（直径 ${length(summary.innerDiameterCm)} cm）。青い点は円内、白い点は円外の着弾。`,
                    `Purple A and B: scale points. Blue circle: ${length(diameterCm)} cm across. Dashed: the inner circle holding half the area (${length(summary.innerDiameterCm)} cm). Filled dots are inside the circle, hollow dots outside.`,
                  )}
                </p>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="step-5-result" className="text-xl font-medium">
                {t('5. 結果', '5. Result')}
              </h2>
              {scale === null ? (
                <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {t('実寸の基準を設定してください（手順 2）。', 'Set the scale (step 2).')}
                </p>
              ) : (
                !circleSet && (
                  <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                    {t('円の直径を入力してください（手順 3）。', 'Enter the circle diameter (step 3).')}
                  </p>
                )
              )}
              <ResultPanel className="grid-cols-3">
                <div className="col-span-3">
                  <ResultFigure
                    size="lead"
                    label={t('パターン率', 'Pattern percentage')}
                    value={patternText}
                    note={
                      pellets === null || pelletsInvalid
                        ? t('手順 3 で装弾の総粒数を入れると表示します。', 'Enter the pellets in the shell (step 3).')
                        : t(
                            `円内の着弾 ÷ 装弾の総粒数 ${number.format(pellets)}`,
                            `Shots inside ÷ ${number.format(pellets)} pellets in the shell`,
                          )
                    }
                  />
                </div>
                <ResultFigure label={t('円内の着弾', 'Inside the circle')} value={count(summary.inside)} />
                <ResultFigure label={t('円外の着弾', 'Outside the circle')} value={count(summary.outside)} />
                <ResultFigure label={t('打点の総数', 'Shots recorded')} value={number.format(shots.length)} />
              </ResultPanel>
              <div className="space-y-3">
                <h3 className="text-base font-medium">{t('分布', 'Distribution')}</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>{t('重心の中心からのずれ', 'Pattern centre offset')}</dt>
                    <dd className="tabular-nums">
                      {/* Three causes for no centre; name the right one. */}
                      {scale === null
                        ? t('実寸の基準が未設定です。', 'Scale not set.')
                        : !circleSet
                          ? t('円の直径が未設定です。', 'Circle diameter not set.')
                          : summary.centroid === null
                            ? t('円内に着弾がありません。', 'No shots inside the circle.')
                            : t(
                                `${horizontal(summary.centroid.x)} cm・${vertical(summary.centroid.y)} cm（直線で ${number.format(summary.centroid.distance)} cm）`,
                                `${horizontal(summary.centroid.x)} cm, ${vertical(summary.centroid.y)} cm (${number.format(summary.centroid.distance)} cm straight-line)`,
                              )}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>
                      {t(
                        `内円（直径 ${length(summary.innerDiameterCm)} cm）の内側と外側`,
                        `Inner circle (${length(summary.innerDiameterCm)} cm) vs outer ring`,
                      )}
                    </dt>
                    <dd className="tabular-nums">
                      {count(summary.inner)} : {count(summary.outer)}
                      {summary.innerShare !== null && ` (${percent.format(summary.innerShare)})`}
                    </dd>
                  </div>
                  <div className="space-y-2">
                    <dt>{t('上下左右の 4 分割', 'Shots by quadrant')}</dt>
                    <dd>
                      {/* Laid out as on the board. */}
                      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-outline-variant tabular-nums">
                        {(
                          [
                            [t('左上', 'Upper left'), summary.quadrants.upperLeft],
                            [t('右上', 'Upper right'), summary.quadrants.upperRight],
                            [t('左下', 'Lower left'), summary.quadrants.lowerLeft],
                            [t('右下', 'Lower right'), summary.quadrants.lowerRight],
                          ] as const
                        ).map(([label, value]) => (
                          <li key={label} className="bg-surface-container px-3 py-2">
                            {label}: {count(value)}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>
          }
          secondary={
            <>
              <ConditionSection
                id="detection"
                title={t('自動検出の設定', 'Detection settings')}
                summary={t(
                  `粒の直径 ${pelletDiameterMm === null || pelletDiameterInvalid ? '未入力' : `${number.format(pelletDiameterMm)} mm`} ・ 明るさで ${thresholdFor(sensitivity)} 段階以上暗い痕`,
                  `Pellet ${pelletDiameterMm === null || pelletDiameterInvalid ? 'size not set' : `${number.format(pelletDiameterMm)} mm`} · ${thresholdFor(sensitivity)} or more brightness levels darker`,
                )}
                forceOpen={pelletDiameterInvalid}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '円の内側と、円の外へ半径の 4 分の 1 までを探します。それより外の着弾は作業エリアを押して追加します。',
                    'Searches the circle and a quarter of its radius beyond it. Tap the workspace to add shots further out.',
                  )}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <RoundedNumberField
                    fieldId="pellet-diameter"
                    label={t('粒の直径', 'Pellet diameter')}
                    unit="mm"
                    min={0}
                    value={pelletDiameterMm}
                    onChange={setPelletDiameterMm}
                    hint={t('使った号数の粒径。', 'The diameter of the shot size you used.')}
                    invalid={pelletDiameterInvalid}
                    errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                  />
                  <div className="min-w-0 space-y-2">
                    <label htmlFor="sensitivity" className="block text-sm font-medium">
                      {t('検出の感度', 'Sensitivity')}
                    </label>
                    <input
                      id="sensitivity"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={sensitivity}
                      onChange={(event) => setSensitivity(Number(event.target.value))}
                      className="w-full accent-primary"
                      aria-describedby="sensitivity-hint"
                    />
                    <p id="sensitivity-hint" className="text-xs text-on-surface-variant">
                      {t(
                        `周囲の紙より明るさで ${thresholdFor(sensitivity)} 段階以上暗い痕を拾います。拾いすぎるときは左へ、拾い残すときは右へ。`,
                        `Counts marks at least ${thresholdFor(sensitivity)} brightness levels darker than the paper. Move left if too many are found, right if holes are missed.`,
                      )}
                    </p>
                  </div>
                </div>
              </ConditionSection>

              <ConditionSection
                id="shot-list"
                title={t('座標で追加・打点の一覧', 'Add by coordinates, shot list')}
                summary={t(
                  `打点 ${number.format(shots.length)} 点`,
                  `${number.format(shots.length)} ${shots.length === 1 ? 'shot' : 'shots'} recorded`,
                )}
              >
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const offset = {
                      x: offsetDraft.x === '' ? NaN : Number(offsetDraft.x),
                      y: offsetDraft.y === '' ? NaN : Number(offsetDraft.y),
                    };
                    if (!addShotAtOffset(offset)) {
                      setMessage({ kind: 'unusable-offset' });
                      return;
                    }
                    setOffsetDraft({ x: '', y: '' });
                    setMessage({ kind: 'added', offset });
                  }}
                >
                  <p className="text-sm font-medium">{t('座標で打点を追加', 'Add a shot by coordinates')}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="min-w-0 space-y-2">
                      <label htmlFor="offset-x" className="block text-sm font-medium">
                        {t('中心からの左右', 'Right of the centre')}{' '}
                        <span className="font-normal text-on-surface-variant">(cm)</span>
                      </label>
                      <input
                        id="offset-x"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={offsetDraft.x}
                        onChange={(event) => setOffsetDraft({ ...offsetDraft, x: event.target.value })}
                        aria-describedby="offset-hint"
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <label htmlFor="offset-y" className="block text-sm font-medium">
                        {t('中心からの上下', 'Above the centre')}{' '}
                        <span className="font-normal text-on-surface-variant">(cm)</span>
                      </label>
                      <input
                        id="offset-y"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={offsetDraft.y}
                        onChange={(event) => setOffsetDraft({ ...offsetDraft, y: event.target.value })}
                        aria-describedby="offset-hint"
                      />
                    </div>
                  </div>
                  <p id="offset-hint" className="text-xs text-on-surface-variant">
                    {t('右・上が正、左・下が負。', 'Right and up positive, left and down negative.')}
                  </p>
                  <Button type="submit" variant="secondary">
                    <LuPlus aria-hidden="true" />
                    {t('この座標で追加', 'Add at these coordinates')}
                  </Button>
                </form>
                <div className="space-y-2 border-t border-outline-variant pt-4">
                  <h3 className="text-sm font-medium">
                    {t(`打点の一覧（${shots.length} 点）`, `List of shots (${shots.length})`)}
                  </h3>
                  {shots.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t('まだ打点がありません。', 'No shots yet.')}</p>
                  ) : (
                    <ul className="divide-y divide-outline-variant">
                      {shots.map((shot, index) => (
                        <li key={shot.id} className="flex items-center gap-2 py-1 text-sm">
                          <span className="min-w-0 flex-1 tabular-nums">
                            {index + 1}. {offsetText(offsets?.[index])}
                          </span>
                          <Button
                            variant="ghost"
                            aria-label={t(`${index + 1} 番目の打点を削除`, `Delete shot ${index + 1}`)}
                            onClick={() => removeShot(shot.id)}
                          >
                            {t('削除', 'Delete')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </ConditionSection>
            </>
          }
          extras={
            <>
              <ConditionSection
                id="step-6-records"
                title={t('6. 記録を保存', '6. Save the measurement')}
                summary={
                  records.length === 0
                    ? t(
                        'メモを付けて名前で保存し、CSV に書き出せます。',
                        'Save the measurement by name with a note, and export CSV.',
                      )
                    : t(
                        `保存した測定 ${records.length} 件`,
                        `${records.length} saved ${records.length === 1 ? 'measurement' : 'measurements'}`,
                      )
                }
              >
                <SavedMeasurements />
              </ConditionSection>

              <ConditionSection
                id="notes"
                title={t('撮影と自動検出の注意', 'Photos and detection')}
                summary={t(
                  'カメラの映像と写真は、送信も保存もしません。',
                  'The camera feed and the photo are never sent or saved.',
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  {notes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
