'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LuArrowRight, LuImage, LuPlus, LuRotateCcw, LuScanSearch, LuTrash2, LuUndo2 } from 'react-icons/lu';

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
import { groupVerdict, summariseStatistics } from '@/lib/group-statistics';
import { detectHoles, thresholdFor } from '@/lib/hole-detection';
import { readImagePixels } from '@/lib/image-pixels';
import { labsTool } from '@/lib/labs-tools';
import type { BulletUnit } from '@/lib/schemas/shot-group';
import type { DistanceUnit, OffsetUnit } from '@/lib/schemas/sight-adjustment';
import {
  distanceBetween,
  summariseGroup,
  toAimOffset,
  toAngularSize,
  toImagePoint,
  toImpactMm,
  type ShotImpact,
} from '@/lib/shot-group';
import { MOA_RADIANS, angularSizeMm, toMeters, toMillimeters } from '@/lib/sight-adjustment';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { selectBulletDiameterMm, selectScale, storageKey, useShotGroupStore, type ImageSize } from './_store';
import { RoundedNumberField } from './fields';
import { createFormatters, UNIT_DIGITS } from './format';
import { GroupCanvas, type PointerMode } from './group-canvas';
import { GroupStatisticsPanel, statisticsHeadline, targetPrecisionInvalid } from './group-statistics-panel';
import { SavedGroups } from './saved-groups';

/** Impacts are read from the whole photo: a group can sit anywhere on the target. */
const wholeImageRegion = (width: number, height: number) => ({
  x: width / 2,
  y: height / 2,
  radius: Math.hypot(width, height) / 2,
});

export function ShotGroupClient() {
  const state = useShotGroupStore();
  const {
    imageSize,
    calibration,
    aim,
    distance,
    offsetUnit,
    bulletDiameter,
    note,
    impacts,
    records,
    targetPrecision,
    setImage,
    setCalibrationPoint,
    setReferenceValue,
    setReferenceUnit,
    setAim,
    setDistance,
    setOffsetUnit,
    setBulletDiameter,
    setBulletUnit,
    addImpact,
    addImpactAtOffset,
    replaceImpacts,
    removeImpact,
    undoImpact,
    clearImpacts,
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
  const [mode, setMode] = useState<PointerMode>('impact');
  const [offsetDraft, setOffsetDraft] = useState({ x: '', y: '' });
  // The event, not its sentence, so the wording follows a language change.
  const [message, setMessage] = useState<
    { kind: 'restarted' } | { kind: 'unusable-offset' } | { kind: 'added'; impact: ShotImpact } | null
  >(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const offsetHintId = useId();
  // State rather than a ref: detection is offered only once the photo has decoded.
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<
    | { kind: 'unreadable' }
    | { kind: 'not-ready' }
    | { kind: 'found'; found: number; tooSmall: number; tooLarge: number; tooRagged: number; overCap: number }
    | null
  >(null);

  const { t, format, length, angle, vertical, horizontal } = createFormatters(language, offsetUnit);
  const sightTool = labsTool('sight-adjustment').title[language];
  // A photo that failed to decode is gone even though its frame stays, so this follows the object URL.
  const hasImage = imageUrl !== null;
  const scale = selectScale(state);
  const pixelSpan = distanceBetween(calibration.a, calibration.b);
  const bulletDiameterMm = selectBulletDiameterMm(state);
  const measured = scale === null ? null : impacts.map((impact) => toImpactMm(impact, aim, scale));
  const summary = summariseGroup(measured ?? [], { bulletDiameterMm });
  const statistics = measured === null ? null : summariseStatistics(measured);
  const distanceMeters = toMeters(distance.value, distance.unit);
  const distanceUsable = Number.isFinite(distanceMeters) && distanceMeters > 0;
  const spreadAngle = toAngularSize(summary.extremeSpreadMm, distanceMeters);
  const offsetAngle = toAngularSize(summary.mpi?.offsetMm ?? null, distanceMeters);
  const moaAtDistance = distanceUsable ? angularSizeMm(MOA_RADIANS, distanceMeters) : NaN;
  const mpiPoint =
    summary.mpi && scale !== null ? toImagePoint({ x: summary.mpi.rightMm, y: summary.mpi.upMm }, aim, scale) : null;

  useEffect(() => {
    void Promise.all([useShotGroupStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
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
    // The impacts were already confirmed as discarded, so clear them even when the photo fails.
    setImage(null);
  }, [setImage]);

  const discarded = useDiscardedSave(storageKey);
  const summarySentence =
    impacts.length === 0
      ? ''
      : scale === null
        ? t('実寸の基準が未設定のため、測定できません。', 'The scale is not set, so nothing is measured.')
        : t(
            `${format(summary.count, 0)} 発。`,
            `${format(summary.count, 0)} ${summary.count === 1 ? 'shot' : 'shots'}.`,
          ) +
          (summary.extremeSpreadMm === null
            ? t('群の大きさは 2 発目から求まります。', ' A group size needs a second shot.')
            : t(
                `最大中心間距離 ${length(summary.extremeSpreadMm)}${spreadAngle ? `、${format(spreadAngle.moa, 2)} MOA` : ''}。`,
                ` Extreme spread ${length(summary.extremeSpreadMm)}${spreadAngle ? `, ${format(spreadAngle.moa, 2)} MOA` : ''}.`,
              ));
  const verdictSentence =
    statistics === null
      ? ''
      : {
          'both-axes': t(' 上下・左右とも、ズレは偶然では説明できません。', ' Both offsets are beyond chance.'),
          'vertical-only': t(
            ' 上下のズレだけが偶然では説明できません。',
            ' Only the vertical offset is beyond chance.',
          ),
          'horizontal-only': t(
            ' 左右のズレだけが偶然では説明できません。',
            ' Only the horizontal offset is beyond chance.',
          ),
          'chance-only': t(
            ' ズレは偶然の範囲内で、補正の向きは決められません。',
            ' Both offsets are within chance; no correction can be set.',
          ),
          'no-dispersion': t(' ばらつきがなく、判定できません。', ' No dispersion to judge.'),
        }[groupVerdict(statistics)];
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    // Announce only once typing settles.
    if (!ready) return;
    const timer = window.setTimeout(() => setSpoken(summarySentence + verdictSentence), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summarySentence, verdictSentence]);

  const confirmStartOver = () =>
    (impacts.length === 0 && note === '') ||
    window.confirm(
      t(
        '着弾・メモ・写真・基準の設定を消して、最初からやり直しますか？',
        'Clear the impacts, note, photo and setup and start over?',
      ),
    );

  const confirmPhotoChange = () =>
    impacts.length === 0 ||
    window.confirm(
      t(
        '写真を変えると、記録した着弾はすべて消えます。続けますか？',
        'Changing the photo clears all impacts. Continue?',
      ),
    );

  const holeDiameterPx = scale !== null && bulletDiameterMm !== null ? bulletDiameterMm / scale : null;
  const canDetect = hasImage && photo !== null && holeDiameterPx !== null && !detecting;

  const runDetection = () => {
    if (!photo || holeDiameterPx === null) {
      setDetection({ kind: 'not-ready' });
      return;
    }
    if (
      impacts.length > 0 &&
      !window.confirm(
        t('現在の着弾を検出結果で置き換えますか？', 'Replace the current impacts with the detected ones?'),
      )
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
          const result = detectHoles(pixels.image, {
            region: wholeImageRegion(pixels.image.width, pixels.image.height),
            holeDiameterPx: holeDiameterPx * pixels.scaleX,
            sensitivity,
            // Darker on white paper, lighter inside a printed bull where the backing shows through.
            polarity: 'either',
          });
          replaceImpacts(result.holes.map((hole) => ({ x: hole.x / pixels.scaleX, y: hole.y / pixels.scaleY })));
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
      return t('写真・実寸の基準・弾径を設定してください。', 'Load a photo and set the scale and bullet diameter.');
    const skipped = detection.tooSmall + detection.tooLarge + detection.tooRagged;
    return (
      t(
        `${format(detection.found, 0)} 発を検出し、着弾を置き換えました。`,
        `Detected ${format(detection.found, 0)} impacts.`,
      ) +
      (skipped === 0
        ? ''
        : t(
            `大きさや形が合わない ${format(skipped, 0)} 件を除外しました。`,
            ` Excluded ${format(skipped, 0)} marks of the wrong size or shape.`,
          )) +
      (detection.overCap === 0
        ? ''
        : t(
            `上限を超えた小さい ${format(detection.overCap, 0)} 件も除外しました。`,
            ` Excluded ${format(detection.overCap, 0)} smaller marks over the limit.`,
          )) +
      t(
        '過不足は、図をタップして追加するか、一覧から削除してください。',
        ' To fix the count, tap the drawing to add or delete from the list.',
      )
    );
  };

  // Short, so the four fit on one row of a phone.
  const modes: { value: PointerMode; label: string }[] = [
    { value: 'impact', label: t('着弾', 'Impacts') },
    { value: 'aim', label: t('狙点', 'Aim point') },
    { value: 'scaleA', label: t('基準点 A', 'Point A') },
    { value: 'scaleB', label: t('基準点 B', 'Point B') },
  ];
  const modeHint = {
    impact: t('弾痕の中心をタップして着弾を追加します。', 'Tap the centre of a hole to add an impact.'),
    aim: t('狙った点をタップすると、青い十字が移動します。', 'Tap the point you aimed at to move the blue cross.'),
    scaleA: t('実寸のわかる 2 点の 1 点目をタップします。', 'Tap the first of two points a known distance apart.'),
    scaleB: t('実寸のわかる 2 点の 2 点目をタップします。', 'Tap the second of the two points.'),
  }[mode];
  const pick = (point: { x: number; y: number }) => {
    if (mode === 'impact') addImpact(point);
    else if (mode === 'aim') setAim(point);
    else setCalibrationPoint(mode === 'scaleA' ? 'a' : 'b', point);
  };
  const positionError = (value: number) =>
    Number.isFinite(value) ? undefined : t('座標を数値で入力してください。', 'Enter the coordinate as a number.');
  const impactText = (impact: ShotImpact | undefined) =>
    impact && Number.isFinite(impact.x) && Number.isFinite(impact.y)
      ? `${horizontal(impact.x)} / ${vertical(impact.y)}`
      : '—';

  const messageText = () => {
    if (message === null) return '';
    if (message.kind === 'restarted') return t('最初からやり直しました。', 'Started over.');
    if (message.kind === 'unusable-offset')
      return t(
        '座標を数値で入力し、実寸の基準を設定してください。',
        'Enter both coordinates as numbers and set the scale.',
      );
    const { x, y } = message.impact;
    return t(
      `${horizontal(x)}、${vertical(y)} に着弾を追加しました。`,
      `Added an impact at ${horizontal(x)}, ${vertical(y)}.`,
    );
  };

  const handoff = summary.mpi ? toAimOffset(summary.mpi) : null;
  const impactName = (direction: 'high' | 'low' | 'right' | 'left') =>
    ({ high: t('上', 'high'), low: t('下', 'low'), right: t('右', 'right'), left: t('左', 'left') })[direction];

  const bulletInvalid = bulletDiameter.value !== null && !(bulletDiameter.value > 0);
  const aimInvalid = !Number.isFinite(aim.x) || !Number.isFinite(aim.y);
  const calibrationInvalid = ['a', 'b'].some((key) => {
    const point = calibration[key as 'a' | 'b'];
    return !Number.isFinite(point.x) || !Number.isFinite(point.y);
  });
  const scaleSummary =
    scale === null
      ? t('基準が未設定です。', 'Scale not set.')
      : t(
          `A–B ${format(calibration.value, UNIT_DIGITS[calibration.unit])} ${calibration.unit}（写真上 ${format(pixelSpan, 1)} px、1 px = ${format(scale, 4)} mm）`,
          `A–B ${format(calibration.value, UNIT_DIGITS[calibration.unit])} ${calibration.unit} (${format(pixelSpan, 1)} px on the photo, ${format(scale, 4)} mm per pixel)`,
        );
  const bulletText =
    bulletDiameter.value === null || bulletInvalid
      ? t('弾径 未入力', 'no bullet diameter')
      : t(
          `弾径 ${format(bulletDiameter.value, bulletDiameter.unit === 'inch' ? 3 : 2)} ${bulletDiameter.unit}`,
          `bullet ${format(bulletDiameter.value, bulletDiameter.unit === 'inch' ? 3 : 2)} ${bulletDiameter.unit}`,
        );
  const setupSummary = distanceUsable
    ? t(
        `射距離 ${format(distance.value, 2)} ${distance.unit}（1 MOA = ${length(moaAtDistance)}）・ ${bulletText}`,
        `${format(distance.value, 2)} ${distance.unit} (1 MOA = ${length(moaAtDistance)}) · ${bulletText}`,
      )
    : t('射距離が未設定です。', 'Distance not set.');
  const statisticsSummary =
    statistics === null
      ? t(
          '着弾 2 発以上で、95% 信頼区間と必要な発数を表示します。',
          'Shows the 95% intervals and the shots needed once there are two impacts.',
        )
      : t(
          `平均半径 ${length(summary.meanRadiusMm)} ・ 標準偏差 ${length(summary.horizontalSdMm)} / ${length(summary.verticalSdMm)}`,
          `Mean radius ${length(summary.meanRadiusMm)} · SD ${length(summary.horizontalSdMm)} / ${length(summary.verticalSdMm)}`,
        );

  const statisticsNotes = [
    t(
      '最大中心間距離は最も離れた 2 発だけで決まり、3 発では偶然に大きく左右されます。平均半径と標準偏差は全弾を使うので安定しやすい値です。銃・実包・射手の評価には、5 発以上の群を複数撃って比べてください。',
      'The extreme spread depends on two shots only, so a three-shot group is largely chance. The mean radius and standard deviations use every shot and settle sooner. To judge a rifle, load or shooter, compare several groups of five or more shots.',
    ),
    t(
      '統計は、撃ち方と条件が最後まで同じだったことを前提にします。射手の疲れ、銃身の加熱、風の変化、依託の崩れがあると、区間も必要発数も実際より狭く出ます。フライヤーを外すのは、理由を説明できるときだけにしてください。',
      'The statistics assume the shooting and conditions stayed the same throughout. Fatigue, a heating barrel, a change in the wind or a slipping rest make the intervals and shot counts tighter than they really are. Remove a flyer only when you can say why it was one.',
    ),
    t(
      'MOA は 1/60 度、mil はミリラジアン（1/1000 ラジアン）です。NATO mil（円周 6400 分割）ではありません。',
      'MOA is 1/60 degree; mil is the milliradian (1/1000 radian), not the NATO mil (6400 per circle).',
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
            { id: 'step-3-aim', label: t('3. 狙点・距離', '3. Aim & distance') },
            { id: 'step-4-impacts', label: t('4. 着弾', '4. Impacts') },
            { id: 'step-5-result', label: t('5. 結果', '5. Result') },
            { id: 'step-6-statistics', label: t('6. 統計', '6. Statistics') },
            { id: 'step-7-records', label: t('7. 記録', '7. Records') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('shot-group').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '写真・縮尺・狙点・着弾・入力した条件を消します。保存した群は残ります。',
                  en: 'Clears the photo, scale, aim point, impacts and settings. Saved groups are kept.',
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
          resultLabel={t('測定結果', 'Measurement')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="step-1-photo" className="text-xl font-medium">
                  {t('1. 写真を読み込む', '1. Load a photo')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '的を平らに張り、正面から撮影してください。カメラの映像と写真は送信も保存もしません。写真なしでも座標で入力できます。',
                    'Keep the target flat and photograph it straight on. The camera feed and the photo are never sent or saved. You can also enter impacts by coordinates without one.',
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
                key={`step-2-${imageUrl ?? 'no-photo'}`}
                id="step-2-scale"
                title={t('2. 実寸を合わせる', '2. Set the scale')}
                summary={scaleSummary}
                defaultOpen={hasImage}
                forceOpen={scale === null || calibrationInvalid}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '図で A・B を実寸のわかる 2 点（定規の目盛りなど）に合わせ、その間の長さを入力します。',
                    'In the workspace, place A and B on two points a known distance apart, such as ruler marks, and enter that distance.',
                  )}
                </p>
                <RoundedNumberField<OffsetUnit>
                  className="sm:max-w-xs"
                  label={t('基準点 A–B の実寸', 'Real distance between A and B')}
                  value={calibration.value}
                  digits={UNIT_DIGITS[calibration.unit]}
                  onChange={(value) => setReferenceValue(value ?? NaN)}
                  min={0}
                  units={{
                    value: calibration.unit,
                    label: t('実寸の単位', 'Reference unit'),
                    options: [
                      { value: 'mm', label: 'mm' },
                      { value: 'cm', label: 'cm' },
                      { value: 'inch', label: 'inch' },
                    ],
                    // A measured length: converted, so the scale does not jump.
                    onChange: setReferenceUnit,
                  }}
                  hint={t('単位を変えると換算されます。', 'Changing the unit converts the value.')}
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
              </ConditionSection>

              {/* Opens with a new photo while the bullet diameter that detection needs is still missing. */}
              <ConditionSection
                key={`step-3-${imageUrl ?? 'no-photo'}`}
                id="step-3-aim"
                defaultOpen={hasImage && bulletDiameter.value === null}
                title={t('3. 狙点・射距離・弾径', '3. Aim point, distance and bullet')}
                summary={setupSummary}
                forceOpen={!distanceUsable || bulletInvalid || aimInvalid}
              >
                <p className="text-sm text-on-surface-variant">
                  {t('図で青い十字を狙った点に合わせます。', 'Move the blue cross onto the point you aimed at.')}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <RoundedNumberField<DistanceUnit>
                    label={t('射距離', 'Distance')}
                    value={distance.value}
                    onChange={(value) => setDistance({ ...distance, value: value ?? NaN })}
                    min={0}
                    units={{
                      value: distance.unit,
                      label: t('距離の単位', 'Distance unit'),
                      options: [
                        { value: 'm', label: 'm' },
                        { value: 'yd', label: 'yd' },
                      ],
                      // A range that was chosen, not a measured length: 100 m becomes 100 yd.
                      onChange: (unit) => setDistance({ ...distance, unit }),
                    }}
                    hint={t(
                      '単位を変えても数値は変わりません（100 m → 100 yd）。',
                      'Changing the unit keeps the number (100 m → 100 yd).',
                    )}
                    invalid={!distanceUsable}
                    errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                  />
                  {/* Ahead of the workspace: detection and the outside measure need it. */}
                  <RoundedNumberField<BulletUnit>
                    label={t('弾径', 'Bullet diameter')}
                    value={bulletDiameter.value}
                    digits={bulletDiameter.unit === 'inch' ? 3 : 2}
                    onChange={setBulletDiameter}
                    min={0}
                    units={{
                      value: bulletDiameter.unit,
                      label: t('弾径の単位', 'Bullet diameter unit'),
                      options: [
                        { value: 'mm', label: 'mm' },
                        { value: 'inch', label: 'inch' },
                      ],
                      // A measured length: converted, so .308 in and 7.82 mm are the same bullet.
                      onChange: setBulletUnit,
                    }}
                    hint={t(
                      '任意。外寸の表示と自動検出に使います。インチは口径表記（.308 など）。',
                      'Optional. Used for the outside measure and detection. In inches, the calibre (e.g. .308).',
                    )}
                    invalid={bulletInvalid}
                    errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                  />
                </div>
                {scale !== null && (
                  <div className="grid grid-cols-2 gap-4">
                    <RoundedNumberField
                      label={t('狙点：左端からの距離', 'Aim point: from the left edge')}
                      unit="mm"
                      value={aim.x * scale}
                      digits={1}
                      onChange={(value) => setAim({ ...aim, x: (value ?? NaN) / scale })}
                      invalid={positionError(aim.x) !== undefined}
                      errorText={positionError(aim.x)}
                    />
                    <RoundedNumberField
                      label={t('狙点：上端からの距離', 'Aim point: from the top edge')}
                      unit="mm"
                      value={aim.y * scale}
                      digits={1}
                      onChange={(value) => setAim({ ...aim, y: (value ?? NaN) / scale })}
                      invalid={positionError(aim.y) !== undefined}
                      errorText={positionError(aim.y)}
                    />
                  </div>
                )}
              </ConditionSection>

              <Card variant="outlined" className="flex flex-col gap-4 rounded-md p-5 sm:p-6">
                <h2 id="step-4-impacts" className="text-xl font-medium">
                  {t('4. 着弾を記録する', '4. Record the impacts')}
                </h2>
                <div className="space-y-2">
                  <SegmentedControl
                    legend={t('図をタップして置くもの', 'Tap to place')}
                    orientation="inline"
                    value={mode}
                    onChange={(value) => setMode(value as PointerMode)}
                    options={modes}
                  />
                  <p className="text-xs text-on-surface-variant">{modeHint}</p>
                </div>
                <div>
                  <GroupCanvas
                    imageUrl={imageUrl}
                    imageSize={imageSize}
                    calibration={calibration}
                    aim={aim}
                    impacts={impacts}
                    extremePair={summary.extremePair}
                    mpiPoint={mpiPoint}
                    mode={mode}
                    onPick={pick}
                    onImageLoad={handleImageLoad}
                    onImageError={handleImageError}
                    label={t(
                      `標的の作図。狙点と ${impacts.length} 発の着弾。`,
                      `Target drawing: the aim point and ${impacts.length} impacts.`,
                    )}
                    describedBy="workspace-caption"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={impacts.length === 0} onClick={undoImpact}>
                    <LuUndo2 aria-hidden="true" />
                    {t('直前を取り消す', 'Undo last impact')}
                  </Button>
                  <Button variant="ghost" disabled={impacts.length === 0} onClick={clearImpacts}>
                    <LuTrash2 aria-hidden="true" />
                    {t('着弾をすべて消す', 'Clear all impacts')}
                  </Button>
                  <Button variant="outline" disabled={!canDetect} onClick={runDetection}>
                    <LuScanSearch aria-hidden="true" />
                    {detecting ? t('検出中…', 'Detecting…') : t('写真から自動で検出', 'Detect impacts')}
                  </Button>
                </div>
                {!canDetect && !detecting && (
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      '自動検出には写真・実寸の基準（手順 2）・弾径（手順 3）が必要です。',
                      'Detection needs a photo, the scale (step 2) and the bullet diameter (step 3).',
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
                    '紫の A・B：実寸の基準。青の十字：狙点。黒い点：着弾（番号は一覧と対応）。赤い線：最大中心間距離。緑の ×：平均着弾点。',
                    'Purple A and B: scale points. Blue cross: aim point. Black dots: impacts, numbered as in the list. Red line: extreme spread. Green ×: mean point of impact.',
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
              {scale === null && (
                <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {t('実寸の基準を設定してください（手順 2）。', 'Set the scale (step 2).')}
                </p>
              )}
              {scale !== null && impacts.length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '図で弾痕の中心をタップするか、写真から自動で検出すると、群の大きさと狙点からのズレを表示します。',
                    'Tap the centre of each hole on the drawing, or detect them from the photo, to see the group size and the offset from the aim point.',
                  )}
                </p>
              )}
              {impacts.length > 0 && (
                <ResultPanel className="grid-cols-2">
                  <div className="col-span-2">
                    <ResultFigure
                      size="lead"
                      label={t('最大中心間距離', 'Extreme spread')}
                      value={length(summary.extremeSpreadMm)}
                      note={
                        summary.extremeSpreadMm === null
                          ? summary.count === 1
                            ? t('1 発では群の大きさが決まりません。', 'A single shot has no group size.')
                            : t('着弾を 2 発以上記録してください。', 'Record at least two impacts.')
                          : t(`穴の中心間。${angle(spreadAngle)}`, `Centre to centre. ${angle(spreadAngle)}`)
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    {/* No MPI means either no impacts or no scale; the note says which. */}
                    <ResultFigure
                      label={t('平均着弾点（MPI）の狙点からのズレ', 'Mean point of impact from the aim point')}
                      value={
                        summary.mpi === null
                          ? '—'
                          : t(
                              `${vertical(summary.mpi.upMm)}・${horizontal(summary.mpi.rightMm)}`,
                              `${vertical(summary.mpi.upMm)}, ${horizontal(summary.mpi.rightMm)}`,
                            )
                      }
                      note={
                        summary.mpi === null
                          ? impacts.length === 0
                            ? t('着弾がありません。', 'No impacts recorded.')
                            : t('実寸の基準が未設定です。', 'Scale not set.')
                          : t(
                              `直線で ${length(summary.mpi.offsetMm)}。${angle(offsetAngle)}`,
                              `Straight-line ${length(summary.mpi.offsetMm)}. ${angle(offsetAngle)}`,
                            )
                      }
                    />
                  </div>
                  <ResultFigure label={t('着弾数', 'Shots')} value={format(impacts.length, 0)} />
                  <ResultFigure
                    label={t('外寸（穴の外側どうし）', 'Outside measure')}
                    value={length(summary.extremeSpreadOuterMm)}
                    note={
                      summary.extremeSpreadOuterMm === null
                        ? t('弾径（手順 3）を入力すると表示します。', 'Enter the bullet diameter (step 3).')
                        : t('中心間距離 + 弾径', 'Centre to centre + bullet diameter')
                    }
                  />
                </ResultPanel>
              )}
              <SegmentedControl
                legend={t('結果の表示単位', 'Result unit')}
                orientation="inline"
                value={offsetUnit}
                onChange={(value) => setOffsetUnit(value as OffsetUnit)}
                options={[
                  { value: 'mm', label: 'mm' },
                  { value: 'cm', label: 'cm' },
                  { value: 'inch', label: 'inch' },
                ]}
              />
              {impacts.length > 0 && (
                <div className="space-y-3 border-t border-outline-variant pt-5">
                  <h3 className="text-base font-medium">{t('照準調整に使う値', 'Values for sight adjustment')}</h3>
                  {/* Whether to correct at all comes before the values. */}
                  <p className="text-sm">{statisticsHeadline(statistics, scale !== null, language)}</p>
                  {handoff === null || !distanceUsable ? (
                    <p className="text-sm text-on-surface-variant">
                      {t(
                        '着弾を記録し、射距離を入力すると表示します。',
                        'Shown once impacts are recorded and the distance is set.',
                      )}
                    </p>
                  ) : (
                    <dl className="grid grid-cols-3 gap-2 rounded-sm bg-surface-container p-3 text-sm">
                      <div>
                        <dt className="text-on-surface-variant">{t('射距離', 'Distance')}</dt>
                        <dd className="tabular-nums">{`${format(distance.value, 2)} ${distance.unit}`}</dd>
                      </div>
                      <div>
                        <dt className="text-on-surface-variant">{t('着弾の上下', 'Vertical impact')}</dt>
                        <dd className="tabular-nums">
                          {t(
                            `${impactName(handoff.vertical.direction)}に ${length(handoff.vertical.valueMm)}`,
                            `${impactName(handoff.vertical.direction)}, ${length(handoff.vertical.valueMm)}`,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-on-surface-variant">{t('着弾の左右', 'Horizontal impact')}</dt>
                        <dd className="tabular-nums">
                          {t(
                            `${impactName(handoff.horizontal.direction)}に ${length(handoff.horizontal.valueMm)}`,
                            `${impactName(handoff.horizontal.direction)}, ${length(handoff.horizontal.valueMm)}`,
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      `ダイヤルの向きとクリック数は「${sightTool}」で出せます。値は手で入力してください。`,
                      `Enter these in the ${sightTool} for the turret direction and clicks. They are not carried over.`,
                    )}
                  </p>
                  <div className="flex flex-wrap gap-x-6">
                    <Link
                      href="/labs/sight-adjustment"
                      className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-primary"
                    >
                      {t(`${sightTool}を開く`, `Open the ${sightTool}`)}
                      <LuArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    <a
                      href="#step-6-statistics"
                      className="inline-flex min-h-12 items-center text-sm font-medium text-primary"
                    >
                      {t('判定の根拠（手順 6）', 'Verdict details (step 6)')}
                    </a>
                  </div>
                </div>
              )}
            </Card>
          }
          secondary={
            <>
              <ConditionSection
                id="detection"
                title={t('自動検出の感度', 'Detection sensitivity')}
                summary={t(
                  `明るさの差が ${thresholdFor(sensitivity)} 段階以上`,
                  `Brightness difference of ${thresholdFor(sensitivity)} levels or more`,
                )}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '弾径に合う丸い痕のうち、周囲より暗いものと、黒点の中で明るく抜けたものを探します。重なった弾痕は 1 つに数え、印刷や汚れを拾うこともあるので、結果は標的と見比べてください。',
                    'Looks for round marks the size of the bullet, darker than the paper or lighter where they go through a black bull. Overlapping holes count as one, and printing or dirt can be picked up, so check the result against the target.',
                  )}
                </p>
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
                      `周囲との明るさの差が ${thresholdFor(sensitivity)} 段階以上の痕を拾います。拾いすぎるときは左へ、拾い残すときは右へ。`,
                      `Counts marks at least ${thresholdFor(sensitivity)} brightness levels from their surroundings. Move left if too many are found, right if holes are missed.`,
                    )}
                  </p>
                </div>
              </ConditionSection>

              <ConditionSection
                id="impact-list"
                title={t('座標で追加・着弾の一覧', 'Add by coordinates, impact list')}
                summary={t(
                  `${format(impacts.length, 0)} 発を記録`,
                  `${format(impacts.length, 0)} ${impacts.length === 1 ? 'impact' : 'impacts'} recorded`,
                )}
              >
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const typed = {
                      x: offsetDraft.x === '' ? NaN : Number(offsetDraft.x),
                      y: offsetDraft.y === '' ? NaN : Number(offsetDraft.y),
                    };
                    const impact = {
                      x: toMillimeters(typed.x, offsetUnit),
                      y: toMillimeters(typed.y, offsetUnit),
                    };
                    if (!addImpactAtOffset(impact)) {
                      setMessage({ kind: 'unusable-offset' });
                      return;
                    }
                    setOffsetDraft({ x: '', y: '' });
                    setMessage({ kind: 'added', impact });
                  }}
                >
                  <p className="text-sm font-medium">{t('座標で着弾を追加', 'Add an impact by coordinates')}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="min-w-0 space-y-2">
                      <label htmlFor="offset-x" className="block text-sm font-medium">
                        {t('狙点からの左右', 'Right of the aim point')}{' '}
                        <span className="font-normal text-on-surface-variant">({offsetUnit})</span>
                      </label>
                      <input
                        id="offset-x"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={offsetDraft.x}
                        onChange={(event) => setOffsetDraft({ ...offsetDraft, x: event.target.value })}
                        aria-describedby={offsetHintId}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <label htmlFor="offset-y" className="block text-sm font-medium">
                        {t('狙点からの上下', 'Above the aim point')}{' '}
                        <span className="font-normal text-on-surface-variant">({offsetUnit})</span>
                      </label>
                      <input
                        id="offset-y"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={offsetDraft.y}
                        onChange={(event) => setOffsetDraft({ ...offsetDraft, y: event.target.value })}
                        aria-describedby={offsetHintId}
                      />
                    </div>
                  </div>
                  <p id={offsetHintId} className="text-xs text-on-surface-variant">
                    {t(
                      '右・上が正、左・下が負。単位は結果の表示単位です。',
                      'Right and up positive, left and down negative, in the result unit.',
                    )}
                  </p>
                  <Button type="submit" variant="secondary">
                    <LuPlus aria-hidden="true" />
                    {t('この座標で追加', 'Add at these coordinates')}
                  </Button>
                </form>
                <div className="space-y-2 border-t border-outline-variant pt-4">
                  <h3 className="text-sm font-medium">
                    {t(`着弾の一覧（${impacts.length} 発）`, `List of impacts (${impacts.length})`)}
                  </h3>
                  {impacts.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t('まだ着弾がありません。', 'No impacts yet.')}</p>
                  ) : (
                    <ul className="divide-y divide-outline-variant">
                      {impacts.map((impact, index) => (
                        <li key={impact.id} className="flex items-center gap-2 py-1 text-sm">
                          <span className="min-w-0 flex-1 tabular-nums">
                            {index + 1}. {impactText(measured?.[index])}
                          </span>
                          <Button
                            variant="ghost"
                            aria-label={t(`${index + 1} 発目の着弾を削除`, `Delete impact ${index + 1}`)}
                            onClick={() => removeImpact(impact.id)}
                          >
                            {t('削除', 'Delete')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!confirmStartOver()) return;
                    choosePhoto(null);
                    reset();
                    setMessage({ kind: 'restarted' });
                  }}
                >
                  <LuRotateCcw aria-hidden="true" />
                  {t('最初からやり直す', 'Start over')}
                </Button>
              </ConditionSection>
            </>
          }
          extras={
            <>
              <ConditionSection
                id="step-6-statistics"
                title={t('6. 統計で確かめる', '6. Statistics')}
                summary={statisticsSummary}
                forceOpen={targetPrecisionInvalid(targetPrecision.value)}
              >
                <dl className="space-y-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>{t('平均半径（MPI からの平均距離）', 'Mean radius (mean distance from the MPI)')}</dt>
                    <dd className="tabular-nums">{length(summary.meanRadiusMm)}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>{t('標準偏差（左右・上下）', 'Standard deviation (horizontal, vertical)')}</dt>
                    <dd className="tabular-nums">
                      {summary.horizontalSdMm === null
                        ? t('2 発以上で求まります。', 'Needs two or more shots.')
                        : `${length(summary.horizontalSdMm)} / ${length(summary.verticalSdMm)}`}
                    </dd>
                  </div>
                </dl>
                <GroupStatisticsPanel statistics={statistics} />
                <ul className="list-disc space-y-2 pl-5 text-xs text-on-surface-variant">
                  {statisticsNotes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </ConditionSection>

              <ConditionSection
                id="step-7-records"
                title={t('7. 記録を保存', '7. Save the group')}
                summary={
                  records.length === 0
                    ? t(
                        'メモを付けて名前で保存し、CSV に書き出せます。',
                        'Save the group by name with a note, and export CSV.',
                      )
                    : t(
                        `保存した群 ${records.length} 件`,
                        `${records.length} saved ${records.length === 1 ? 'group' : 'groups'}`,
                      )
                }
              >
                <SavedGroups />
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
