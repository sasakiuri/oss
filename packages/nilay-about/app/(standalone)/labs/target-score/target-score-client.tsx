'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuImage, LuSave, LuScanSearch, LuTrash2, LuUndo2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  CameraCapture,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SectionNav,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  TrendChart,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { detectHoles, thresholdFor } from '@/lib/hole-detection';
import { MARKER_SIZE_MM } from '@/lib/home-target';
import { readImagePixels } from '@/lib/image-pixels';
import {
  SERIES_LENGTH,
  issfTarget,
  issfTargets,
  scoreShot,
  summariseCard,
  type IssfTargetKey,
} from '@/lib/issf-target';
import { labsTool } from '@/lib/labs-tools';
import { frameScaleAt, measureImpact, summariseGroup, toSheetPoint, type Point } from '@/lib/shot-group';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { selectFrame, selectImageSize, storageKey, useTargetScoreStore, type AlignMode } from './_store';
import { TargetCanvas, type TargetPointerMode } from './target-canvas';

const RULE_BOOK_URL = 'https://www.issf-sports.org/rules';

export function TargetScoreClient() {
  const state = useTargetScoreStore();
  const {
    target: targetKey,
    decimal,
    sighting,
    shots,
    sessions,
    deletedSession,
    photoSize,
    alignMode,
    centre,
    edge,
    corners,
    markerSpacing,
    setTarget,
    setDecimal,
    setSighting,
    addShot,
    replaceShots,
    removeShot,
    undoShot,
    clearShots,
    setPhoto,
    setAlignMode,
    setCentre,
    setEdge,
    setCorner,
    setMarkerSpacing,
    saveSession,
    loadSession,
    deleteSession,
    undoDelete,
    reset,
  } = state;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [photo, setPhotoElement] = useState<HTMLImageElement | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [mode, setMode] = useState<TargetPointerMode>('shot');
  const [sensitivity, setSensitivity] = useState(0.5);
  const [detection, setDetection] = useState<[string, string] | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [message, setMessage] = useState<[string, string] | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

  useEffect(() => {
    void Promise.all([useTargetScoreStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const target = issfTarget(targetKey);
  const frame = selectFrame(state);
  const imageSize = selectImageSize(state);
  const useDecimal = decimal && target.decimal;
  const card = summariseCard(target, shots, useDecimal);
  const matchShots = shots.filter((shot) => !shot.sighter);
  const group = summariseGroup(matchShots);
  const scoreText = (shot: { x: number; y: number }) => {
    const score = scoreShot(target, Math.hypot(shot.x, shot.y));
    if (!score) return '—';
    const value = useDecimal ? number(score.decimal ?? 0, 1) : String(score.ring);
    return score.innerTen ? `${value}*` : value;
  };
  const totalText = (value: number) => (useDecimal ? number(value, 1) : number(value, 0));

  const choosePhoto = (file: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = file ? URL.createObjectURL(file) : null;
    setPhotoElement(null);
    setImageFailed(false);
    setDetection(null);
    setImageUrl(urlRef.current);
    if (!file) setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
    setMode(file ? 'centre' : 'shot');
  };
  const handleImageLoad = useCallback(
    (decoded: HTMLImageElement) => {
      setPhotoElement(decoded);
      setPhoto({ width: decoded.naturalWidth, height: decoded.naturalHeight });
    },
    [setPhoto],
  );
  const handleImageError = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhotoElement(null);
    setImageFailed(true);
    setImageUrl(null);
    setPhoto(null);
  }, [setPhoto]);

  const pick = (point: Point) => {
    if (mode === 'centre') setCentre(point);
    else if (mode === 'edge') setEdge(point);
    else if (mode === 'corner') {
      let nearest = 0;
      corners.forEach((corner, index) => {
        const best = corners[nearest] as Point;
        if (Math.hypot(point.x - corner.x, point.y - corner.y) < Math.hypot(point.x - best.x, point.y - best.y))
          nearest = index;
      });
      setCorner(nearest as 0 | 1 | 2 | 3, point);
    } else if (frame) {
      const shot = measureImpact(point, centre, frame);
      if (shot) addShot(shot);
    }
  };

  const hasPhoto = imageUrl !== null && photoSize !== null;
  const runDetection = () => {
    if (!photo || !frame) return;
    if (
      shots.length > 0 &&
      !window.confirm(t('記録した弾を検出結果で置き換えますか？', 'Replace the recorded shots with the detected ones?'))
    )
      return;
    const scale = frameScaleAt(frame, centre);
    const pixels = readImagePixels(photo);
    if (!pixels || scale === null) {
      setDetection(['写真を読み取れませんでした。', 'Could not read the photo.']);
      return;
    }
    const outer = ((target.ringDiametersMm[0] as number) / 2 + target.calibreMm) / scale;
    const result = detectHoles(pixels.image, {
      region: { x: centre.x * pixels.scaleX, y: centre.y * pixels.scaleY, radius: outer * pixels.scaleX },
      holeDiameterPx: (target.calibreMm / scale) * pixels.scaleX,
      sensitivity,
      polarity: 'either',
    });
    const marks = frame.kind === 'sheet' ? corners.map((corner) => toSheetPoint(corner, frame)) : [];
    const found = result.holes
      .map((hole) => ({ x: hole.x / pixels.scaleX, y: hole.y / pixels.scaleY }))
      .filter((hole) => {
        const onSheet = frame.kind === 'sheet' ? toSheetPoint(hole, frame) : null;
        return !marks.some(
          (mark) => mark && onSheet && Math.hypot(onSheet.x - mark.x, onSheet.y - mark.y) <= MARKER_SIZE_MM,
        );
      })
      .map((hole) => measureImpact(hole, centre, frame))
      .filter((shot): shot is { x: number; y: number } => shot !== null);
    replaceShots(found);
    setDetection([
      `${found.length} 発を検出しました。重なった弾痕は 1 発になります。`,
      `Detected ${found.length} shots. Overlapping holes count as one.`,
    ]);
  };

  const modes: { value: TargetPointerMode; label: string }[] = hasPhoto
    ? [
        { value: 'shot', label: t('弾痕', 'Shots') },
        { value: 'centre', label: t('中心', 'Centre') },
        alignMode === 'corners'
          ? { value: 'corner', label: t('四隅の目印', 'Corner marks') }
          : { value: 'edge', label: t('黒点の縁', 'Black edge') },
      ]
    : [];
  const chooseAlign = (next: AlignMode) => {
    setAlignMode(next);
    if (next === 'corners' && mode === 'edge') setMode('corner');
    if (next === 'black-edge' && mode === 'corner') setMode('edge');
  };

  const chronological = [...sessions].sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
  const shortDate = new Intl.DateTimeFormat(language, { month: 'numeric', day: 'numeric' });
  const sessionSummary = (session: (typeof sessions)[number]) =>
    summariseCard(issfTarget(session.target), session.shots, session.decimal);

  const confirmCardChange = () =>
    shots.length === 0 ||
    window.confirm(t('記録中の弾は消えます。続けますか？', 'The shots on this card will be cleared. Continue?'));

  const summaryLine =
    card.shots === 0
      ? t('本射の弾はまだありません。', 'No match shots yet.')
      : t(
          `本射 ${card.shots} 発・合計 ${totalText(card.total)}・平均 ${number(card.average ?? 0, 2)}・インナーテン ${card.innerTens}`,
          `${card.shots} match shots, total ${totalText(card.total)}, average ${number(card.average ?? 0, 2)}, ${card.innerTens} inner tens`,
        );

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'score-target', label: t('標的', 'Target') },
            { id: 'score-shots', label: t('弾の記録', 'Shots') },
            { id: 'score-result', label: t('得点', 'Score') },
            { id: 'score-sessions', label: t('記録', 'Records') },
            { id: 'score-method', label: t('採点方法', 'Method') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('target-score').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '記録中の弾・写真・標的の設定を消します。保存した記録は残ります。',
                  en: 'Clears the shots on the card, the photo and the target settings. Saved cards are kept.',
                }}
                onReset={() => {
                  choosePhoto(null);
                  reset();
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {ready ? summaryLine : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          proportions="workspace"
          resultLabel={t('得点', 'Score')}
          primary={
            <>
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="score-target" className="text-xl font-medium">
                  {t('1. 標的と採点', '1. Target and scoring')}
                </h2>
                <SelectField<IssfTargetKey>
                  label={t('標的', 'Target')}
                  value={targetKey}
                  onChange={(value) => {
                    if (confirmCardChange()) setTarget(value);
                  }}
                  options={issfTargets.map((item) => ({ value: item.key, label: item.name[language] }))}
                />
                <SegmentedControl
                  legend={t('採点', 'Scoring')}
                  orientation="inline"
                  value={useDecimal ? 'decimal' : 'integer'}
                  onChange={(value) => setDecimal(value === 'decimal')}
                  options={[
                    { value: 'decimal', label: t('小数点（10.9 まで）', 'Decimal (to 10.9)') },
                    { value: 'integer', label: t('整数', 'Whole rings') },
                  ]}
                />
                {!target.decimal && (
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      'この標的は 10 点圏の幅がほかの環と違うため、整数で採点します。',
                      'This target’s 10 ring is wider than the other rings, so it is scored in whole rings.',
                    )}
                  </p>
                )}
                <SegmentedControl
                  legend={t('次に記録する弾', 'Next shots are')}
                  orientation="inline"
                  value={sighting ? 'sighter' : 'match'}
                  onChange={(value) => setSighting(value === 'sighter')}
                  options={[
                    { value: 'match', label: t('本射', 'Match') },
                    { value: 'sighter', label: t('試射', 'Sighters') },
                  ]}
                />
              </Card>

              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="score-shots" className="text-xl font-medium">
                  {t('2. 弾を記録する', '2. Record the shots')}
                </h2>
                <CameraCapture
                  language={language}
                  label={t('カメラのプレビュー', 'Camera preview')}
                  confirmCapture={() => true}
                  onCapture={(file) => choosePhoto(file)}
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    id="score-photo"
                    type="file"
                    accept="image/*"
                    className="peer sr-only"
                    onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor="score-photo"
                    className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  >
                    <LuImage aria-hidden="true" className="size-[18px]" />
                    {t('写真を選ぶ', 'Choose a photo')}
                  </label>
                  {imageUrl !== null && (
                    <Button variant="ghost" onClick={() => choosePhoto(null)}>
                      {t('写真を外して描いた標的に戻る', 'Remove the photo and use the drawn target')}
                    </Button>
                  )}
                </div>
                {imageFailed && (
                  <p role="alert" className="text-sm text-destructive">
                    {t('画像を読み込めませんでした。', 'Could not read the image.')}
                  </p>
                )}
                {hasPhoto && (
                  <div className="space-y-3 rounded-sm bg-surface-container p-3">
                    <SegmentedControl
                      legend={t('写真と標的の合わせ方', 'How to line up the photo')}
                      orientation="inline"
                      value={alignMode}
                      onChange={(value) => chooseAlign(value as AlignMode)}
                      options={[
                        { value: 'black-edge', label: t('中心と黒点の縁', 'Centre and black edge') },
                        { value: 'corners', label: t('四隅の目印', 'Corner marks') },
                      ]}
                    />
                    <p className="text-xs text-on-surface-variant">
                      {alignMode === 'black-edge'
                        ? t(
                            `＋を標的の中心、E を黒点の縁（直径 ${target.blackMm} mm）に合わせます。正面から撮った写真に使います。`,
                            `Put + on the centre of the target and E on the edge of the black (${target.blackMm} mm across). For a photo taken straight on.`,
                          )
                        : t(
                            '「練習用標的の作成」で目印を付けた用紙用。1〜4 を目印の白い中心に、＋を標的の中心に合わせます。',
                            'For a sheet with corner marks from the Practice Target Maker. Put 1 to 4 on the white centres of the marks and + on the centre of the target.',
                          )}
                    </p>
                    {alignMode === 'corners' && (
                      <div className="grid grid-cols-2 gap-4">
                        <NumberField
                          label={t('目印の中心間（横）', 'Marks apart, across')}
                          unit="mm"
                          value={markerSpacing.width}
                          onChange={(width) => setMarkerSpacing({ ...markerSpacing, width })}
                          invalid={!(markerSpacing.width > 0)}
                          errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                        />
                        <NumberField
                          label={t('目印の中心間（縦）', 'Marks apart, down')}
                          unit="mm"
                          value={markerSpacing.height}
                          onChange={(height) => setMarkerSpacing({ ...markerSpacing, height })}
                          invalid={!(markerSpacing.height > 0)}
                          errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                        />
                      </div>
                    )}
                    {frame === null && (
                      <p className="text-sm text-destructive">
                        {t(
                          '写真と標的を合わせられません。点が重なっていないか、目印の順番（1 左上・2 右上・3 右下・4 左下）を確かめてください。',
                          'The photo cannot be lined up. Check that the points are apart and the marks go 1 top left, 2 top right, 3 bottom right, 4 bottom left.',
                        )}
                      </p>
                    )}
                    <SegmentedControl
                      legend={t('図をタップして置くもの', 'Tap to place')}
                      orientation="inline"
                      value={mode}
                      onChange={(value) => setMode(value as TargetPointerMode)}
                      options={modes}
                    />
                  </div>
                )}
                <TargetCanvas
                  imageUrl={imageUrl}
                  imageSize={imageSize}
                  target={target}
                  frame={frame}
                  centre={hasPhoto ? centre : { x: imageSize.width / 2, y: imageSize.height / 2 }}
                  alignMode={alignMode}
                  edge={edge}
                  corners={corners}
                  shots={shots}
                  mode={hasPhoto ? mode : 'shot'}
                  onPick={
                    hasPhoto
                      ? pick
                      : (point) => {
                          if (!frame) return;
                          const shot = measureImpact(point, { x: imageSize.width / 2, y: imageSize.height / 2 }, frame);
                          if (shot) addShot(shot);
                        }
                  }
                  onImageLoad={handleImageLoad}
                  onImageError={handleImageError}
                  label={t(
                    `${target.name.ja}の標的。本射 ${card.shots} 発、試射 ${card.sighters} 発。`,
                    `${target.name.en} target: ${card.shots} match shots and ${card.sighters} sighters.`,
                  )}
                  describedBy="score-canvas-caption"
                />
                <p id="score-canvas-caption" className="text-xs text-on-surface-variant">
                  {t(
                    '青い丸：本射（番号は撃った順）。灰色の S：試射。丸の大きさは弾径です。',
                    'Blue: match shots, numbered in order. Grey S: sighters. Each circle is the size of the pellet or bullet.',
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={shots.length === 0} onClick={undoShot}>
                    <LuUndo2 aria-hidden="true" />
                    {t('直前を取り消す', 'Undo last shot')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={shots.length === 0}
                    onClick={() => {
                      if (confirmCardChange()) clearShots();
                    }}
                  >
                    <LuTrash2 aria-hidden="true" />
                    {t('弾をすべて消す', 'Clear all shots')}
                  </Button>
                  {hasPhoto && (
                    <Button variant="outline" disabled={!photo || frame === null} onClick={runDetection}>
                      <LuScanSearch aria-hidden="true" />
                      {t('写真から弾痕を検出', 'Detect the holes')}
                    </Button>
                  )}
                </div>
                {hasPhoto && (
                  <div className="space-y-2">
                    <label htmlFor="score-sensitivity" className="block text-sm font-medium">
                      {t('検出の感度', 'Sensitivity')}
                    </label>
                    <input
                      id="score-sensitivity"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={sensitivity}
                      onChange={(event) => setSensitivity(Number(event.target.value))}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        `周囲との明るさの差が ${thresholdFor(sensitivity)} 段階以上の、弾径に合う丸い痕を探します。`,
                        `Looks for round marks the size of the calibre, at least ${thresholdFor(sensitivity)} brightness levels from their surroundings.`,
                      )}
                    </p>
                  </div>
                )}
                <p role="status" className={detection ? 'text-sm' : 'sr-only'}>
                  {detection ? t(...detection) : ''}
                </p>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="score-result" className="text-xl font-medium">
                {t('3. 得点', '3. Score')}
              </h2>
              <ResultPanel className="grid-cols-2">
                <div className="col-span-2">
                  <ResultFigure
                    size="lead"
                    label={t(`合計（本射 ${card.shots} 発）`, `Total (${card.shots} match shots)`)}
                    value={totalText(card.total)}
                    note={t(`インナーテン ${card.innerTens} 発`, `${card.innerTens} inner tens`)}
                  />
                </div>
                <ResultFigure
                  label={t('1 発の平均', 'Average per shot')}
                  value={card.average === null ? '—' : number(card.average, 2)}
                />
                <ResultFigure
                  label={t('平均着弾点のズレ', 'Mean point of impact')}
                  value={
                    group.mpi === null
                      ? '—'
                      : `${number(Math.abs(group.mpi.upMm), 1)} mm ${group.mpi.upMm >= 0 ? t('上', 'up') : t('下', 'down')}`
                  }
                  note={
                    group.mpi === null
                      ? undefined
                      : `${number(Math.abs(group.mpi.rightMm), 1)} mm ${group.mpi.rightMm >= 0 ? t('右', 'right') : t('左', 'left')}`
                  }
                />
              </ResultPanel>
              {card.series.length > 0 && (
                <table className="w-full text-sm tabular-nums">
                  <caption className="mb-1 text-left text-sm font-medium">
                    {t(`シリーズ（${SERIES_LENGTH} 発ごと）`, `Series of ${SERIES_LENGTH}`)}
                  </caption>
                  <thead>
                    <tr className="text-left text-on-surface-variant">
                      <th scope="col" className="font-normal">
                        {t('シリーズ', 'Series')}
                      </th>
                      <th scope="col" className="font-normal">
                        {t('発数', 'Shots')}
                      </th>
                      <th scope="col" className="font-normal">
                        {t('得点', 'Score')}
                      </th>
                      <th scope="col" className="font-normal">
                        {t('インナーテン', 'Inner tens')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {card.series.map((series, index) => (
                      <tr key={index}>
                        <th scope="row" className="py-1 text-left font-medium">
                          {index + 1}
                        </th>
                        <td>{series.shots}</td>
                        <td>{totalText(series.total)}</td>
                        <td>{series.innerTens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  {t(`弾の一覧（${shots.length} 発）`, `Shots (${shots.length})`)}
                </h3>
                {shots.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">{t('まだ弾がありません。', 'No shots yet.')}</p>
                ) : (
                  <ol className="divide-y divide-outline-variant text-sm">
                    {shots.map((shot, index) => {
                      const matchNumber = shots.slice(0, index + 1).filter((item) => !item.sighter).length;
                      const name = shot.sighter
                        ? t(`試射 ${index + 1 - matchNumber}`, `Sighter ${index + 1 - matchNumber}`)
                        : t(`${matchNumber} 発目`, `Shot ${matchNumber}`);
                      return (
                        <li key={shot.id} className="flex items-center gap-2 py-1">
                          <span className="min-w-0 flex-1 tabular-nums">
                            {name}：{scoreText(shot)}
                          </span>
                          <Button
                            variant="ghost"
                            aria-label={t(`${name}を削除`, `Delete ${name.toLowerCase()}`)}
                            onClick={() => removeShot(shot.id)}
                          >
                            {t('削除', 'Delete')}
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <p className="text-xs text-on-surface-variant">{t('* はインナーテン。', '* marks an inner ten.')}</p>
              </div>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="score-sessions"
                title={t('4. 記録を保存', '4. Save the card')}
                summary={
                  sessions.length === 0
                    ? t('保存した記録はありません', 'No saved cards')
                    : t(`保存した記録 ${sessions.length} 件`, `${sessions.length} saved cards`)
                }
              >
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!saveSession(sessionName)) {
                      setMessage(
                        shots.length === 0
                          ? ['弾を記録してから保存してください。', 'Record shots before saving.']
                          : ['同じ名前の記録があります。', 'That name is already used.'],
                      );
                      return;
                    }
                    setSessionName('');
                    setMessage(
                      useStorageStatus.getState().available
                        ? ['保存しました。', 'Saved.']
                        : ['端末に保存できませんでした。', 'Could not save to this device.'],
                    );
                  }}
                >
                  <label htmlFor="score-session-name" className="block text-sm font-medium">
                    {t('記録名', 'Card name')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="score-session-name"
                      type="text"
                      value={sessionName}
                      onChange={(event) => setSessionName(event.target.value)}
                      placeholder={t('例：9/24 練習', 'e.g. 24 Sep practice')}
                      className="min-w-0 flex-1"
                    />
                    <Button type="submit" variant="secondary" disabled={!sessionName.trim() || !storageAvailable}>
                      <LuSave aria-hidden="true" />
                      {t('保存', 'Save')}
                    </Button>
                  </div>
                </form>
                {sessions.length > 1 && (
                  <TrendChart
                    label={t(
                      `保存した ${sessions.length} 件の 1 発あたり平均点の推移`,
                      `Average score per shot of the ${sessions.length} saved cards over time`,
                    )}
                    points={chronological.map((session) => shortDate.format(new Date(session.savedAt)))}
                    series={[
                      {
                        name: t('1 発の平均', 'Average per shot'),
                        values: chronological.map((session) => sessionSummary(session).average),
                      },
                    ]}
                    formatValue={(value) => number(value, 1)}
                  />
                )}
                {sessions.length > 0 && (
                  <ul className="divide-y divide-outline-variant border-y border-outline-variant">
                    {sessions.map((session) => {
                      const summary = sessionSummary(session);
                      const sessionTarget = issfTarget(session.target);
                      return (
                        <li key={session.id} className="space-y-1 py-3">
                          <p className="font-medium">{session.name}</p>
                          <p className="text-sm text-on-surface-variant">
                            {sessionTarget.name[language]}
                            {' ・ '}
                            {t(`${summary.shots} 発`, `${summary.shots} shots`)}
                            {' ・ '}
                            {t('合計 ', 'total ')}
                            {session.decimal ? number(summary.total, 1) : number(summary.total, 0)}
                            {' ・ '}
                            {t('平均 ', 'average ')}
                            {summary.average === null ? '—' : number(summary.average, 2)}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                if (!confirmCardChange()) return;
                                loadSession(session.id);
                                setMessage([`「${session.name}」を読み込みました。`, `Loaded “${session.name}”.`]);
                              }}
                            >
                              {t('呼び出す', 'Load')}
                            </Button>
                            <Button
                              variant="ghost"
                              aria-label={t(`「${session.name}」を削除`, `Delete ${session.name}`)}
                              onClick={() => {
                                deleteSession(session.id);
                                setMessage(null);
                              }}
                            >
                              {t('削除', 'Delete')}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div role="status" className={deletedSession || message ? 'space-y-2 text-sm' : 'sr-only'}>
                  {deletedSession && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        {t(
                          `「${deletedSession.session.name}」を削除しました。`,
                          `Deleted “${deletedSession.session.name}”.`,
                        )}
                      </span>
                      <Button variant="ghost" onClick={undoDelete}>
                        {t('元に戻す', 'Undo')}
                      </Button>
                    </div>
                  )}
                  {message && <p>{t(...message)}</p>}
                </div>
              </ConditionSection>
              <ConditionSection
                id="score-method"
                title={t('採点方法と出典', 'Scoring method and sources')}
                summary={t('ISSF Rule Book 2026 の標的寸法', 'Target sizes from the ISSF Rule Book 2026')}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    {t(
                      `標的の寸法は ISSF Rule Book 2026（Edition 2025 Second Print 07/2026、2026 年 7 月 1 日発効）の規則 ${target.rule} の外径です。弾径は ${target.calibreMm} mm で採点します。`,
                      `Ring sizes are the outside diameters in rule ${target.rule} of the ISSF Rule Book 2026 (Edition 2025, second print 07/2026, effective 1 July 2026). Shots are scored with a ${target.calibreMm} mm hole.`,
                    )}
                  </li>
                  <li>
                    {t(
                      '弾径は、5.6 mm の種目が 5.6 mm、25m センターファイアが口径（7.62〜9.65 mm）によらず 9.65 mm のゲージです（紙標的採点規則 1.4.1、1.4.3）。シリーズは同点決着に使う 10 発ごとにまとめます（Rule Book 6.15.1 b）。25m 種目の 5 発シリーズ 2 つが 1 シリーズです。',
                      'The hole is 5.6 mm for the 5.6 mm events and 9.65 mm for 25m Centre Fire whatever its calibre (7.62 to 9.65 mm), as the scoring gauges are (Paper Target Scoring 1.4.1, 1.4.3). Series are of ten shots, the series ties are broken on (Rule Book 6.15.1 b); in the 25m events two five-shot series make one.',
                    )}
                  </li>
                  <li>
                    {t(
                      '弾痕が上位の環の外縁に触れれば上位の点（紙標的採点規則 5.2.1）。小数点は 1 環の採点範囲を 10 等分し、10.0〜10.9 とします（Rule Book 6.3.3.1）。',
                      'A hole touching the outer edge of a higher ring scores the higher value (Paper Target Scoring 5.2.1). Decimal scoring divides each ring’s scoring area into ten, 10.0 to 10.9 (Rule Book 6.3.3.1).',
                    )}
                  </li>
                  <li>
                    {t(
                      'インナーテンは、エアライフルが 10 点の点が完全に撃ち抜かれたとき、ほかの標的はインナーテン環に触れたときです。',
                      'An inner ten on the air rifle target is the 10 dot shot out completely; on the others, a hole touching the inner ten ring.',
                    )}
                  </li>
                  <li>
                    {t(
                      '小数点は、弾痕の中心までの距離から弾の半径を差し引き、環の境界と比べて求めます。電子標的が小数点を求める式は規則に定めがありません。',
                      'Decimals come from the centre distance minus the calibre’s radius, compared with the ring edges. The rules do not give the formula electronic targets use.',
                    )}
                  </li>
                  <li>
                    {t(
                      '本射の小数点採点は、10m エアライフル・50m 伏射などの本射と、決勝で使われます（Rule Book 6.3.3.2–6.3.3.3）。',
                      'Decimal scoring is used in the qualification of events such as 10m Air Rifle and 50m Prone, and in finals (Rule Book 6.3.3.2–6.3.3.3).',
                    )}
                  </li>
                  <li>
                    <a href={RULE_BOOK_URL} className="text-primary underline" target="_blank" rel="noreferrer">
                      ISSF Rules
                    </a>
                    {t('（2026-09-24 確認）', ' (checked 2026-09-24)')}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
