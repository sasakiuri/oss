'use client';

import type { ReactNode } from 'react';

import {
  GIBIER_ABNORMALITIES,
  GIBIER_DISINFECTION_LABELS,
  GIBIER_HIT_SITE_LABELS,
  GIBIER_METHOD_LABELS,
  GIBIER_SNARE_SITE_LABELS,
  GIBIER_SOURCES,
  answerLabel,
  formatGibierDateTime,
  formatGibierDuration,
  gibierElapsed,
  gibierRecordInForce,
  gibierSitesText,
  gibierSpeciesText,
  presenceLabel,
} from '@/lib/gibier-record';
import { GIBIER_ABNORMALITY_KEYS, type GibierRecord } from '@/lib/schemas/gibier-record';

import styles from './gibier-record-print.module.css';

interface GibierRecordSheetProps {
  record: GibierRecord;
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <tr>
    <th scope="row">{label}</th>
    <td>{children}</td>
  </tr>
);

/** Joins the parts that were filled in, so an empty field leaves no stray separator on paper. */
const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join('　');

/**
 * The record on A4, item by item in the order of 様式 2. The boxes the facility fills in (記録者,
 * 衛生管理者, 受入の可否, 受入個体管理番号) are printed empty for them.
 */
export function GibierRecordSheet({ record: entered }: GibierRecordSheetProps) {
  // Details behind an answer switched to 無 are kept in the form but never printed beside it.
  const record = gibierRecordInForce(entered);
  const elapsed = gibierElapsed(record.bleedingStartedAt, record.deliveredAt);
  const method =
    record.method === ''
      ? ''
      : record.method === 'other' && record.methodOther.trim()
        ? `その他（${record.methodOther.trim()}）`
        : GIBIER_METHOD_LABELS[record.method];
  return (
    <div className={styles.sheet} lang="ja">
      <div className={styles.head}>
        <div>
          <p className={styles.title}>捕獲個体の記録</p>
          <p className={styles.subtitle}>
            様式 2「捕獲・受入個体記録表（日報）」の項目に沿った捕獲時の記録（1 頭ごと）
          </p>
        </div>
        <table className={styles.signature}>
          <tbody>
            <tr>
              <th scope="col">記録者</th>
              <th scope="col">衛生管理者</th>
            </tr>
            <tr>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className={styles.section}>1. 捕獲に関する情報</p>
      <table className={styles.table}>
        <tbody>
          <Row label="捕獲獣種">{gibierSpeciesText(record)}</Row>
          <Row label="捕獲者名及び狩猟免許番号">
            {join(
              record.hunterName && `氏名：${record.hunterName}`,
              record.licenseNumber && `番号：${record.licenseNumber}`,
            )}
          </Row>
          <Row label="捕獲者の健康状態">
            {record.hunterSymptoms && `発熱、下痢、嘔吐、風邪症状：${presenceLabel(record.hunterSymptoms)}`}
          </Row>
          <Row label="止め刺し者名、健康状態">
            {join(
              record.slaughtererName,
              record.slaughtererSymptoms && `発熱、下痢、嘔吐、風邪症状：${presenceLabel(record.slaughtererSymptoms)}`,
            )}
          </Row>
          <Row label="捕獲日時">{formatGibierDateTime(record.capturedAt)}</Row>
          <Row label="捕獲場所">{join(record.captureCity, record.captureArea)}</Row>
          <Row label="捕獲時の天候">{record.weather}</Row>
          <Row label="捕獲方法">{method}</Row>
          <Row label="被弾または止め刺し、電気ショッカー行使部位">
            {gibierSitesText(record.hitSites, GIBIER_HIT_SITE_LABELS, record.hitSiteOther)}
          </Row>
          <Row label="止め刺しの方法 ※">
            {join(record.slaughterByGun && `銃の使用：${answerLabel(record.slaughterByGun)}`, record.slaughterMethod)}
          </Row>
          <Row label="くくりわなのかかり部位">
            {gibierSitesText(record.snareSites, GIBIER_SNARE_SITE_LABELS, record.snareSiteOther)}
          </Row>
          <Row label="損傷の有無">
            {join(
              presenceLabel(record.injury),
              record.injury === 'yes' && record.injurySite && `損傷部位：${record.injurySite}`,
            )}
          </Row>
          <Row label="放血用ナイフの消毒">
            {record.knifeDisinfection.map((value) => GIBIER_DISINFECTION_LABELS[value]).join('、')}
          </Row>
          <Row label="放血の状況">
            {join(
              record.bleeding && `放血：${presenceLabel(record.bleeding)}`,
              record.bleedingStartedAt && `開始：${formatGibierDateTime(record.bleedingStartedAt)}`,
              record.bleedingPlace && `場所：${record.bleedingPlace}`,
            )}
            {record.arteryCut && (
              <>
                <br />
                心臓が動いている状態で頸動脈又は腕頭動脈を切断した：{answerLabel(record.arteryCut)}
              </>
            )}
            {record.bloodAppearance && (
              <>
                <br />
                放血液の性状：{record.bloodAppearance === 'normal' ? '異常なし' : '異常あり'}
                {record.bloodAppearance === 'abnormal' &&
                  record.bloodAppearanceNote &&
                  `（${record.bloodAppearanceNote}）`}
              </>
            )}
          </Row>
          <Row label="放血後の体温">
            {join(
              record.palpation &&
                `触診：${record.palpation === 'high' ? '高温' : record.palpation === 'normal' ? '異常なし' : '低温'}`,
              record.bodyTemperature && `温度計測定：${record.bodyTemperature}℃`,
              record.temperatureSite && `計測部位：${record.temperatureSite}`,
            )}
          </Row>
          <Row label="内臓摘出の状況">
            {join(
              record.evisceration && `摘出：${presenceLabel(record.evisceration)}`,
              record.eviscerationStartedAt && `開始時刻：${record.eviscerationStartedAt}`,
              record.eviscerationPlace && `場所：${record.eviscerationPlace}`,
            )}
          </Row>
          <Row label="内臓摘出の方法、内臓・臭気の異常 ※">
            {join(
              record.eviscerationMethod && `方法：${record.eviscerationMethod}`,
              record.organAbnormality &&
                `内臓の異常：${presenceLabel(record.organAbnormality)}${
                  record.organAbnormality === 'yes' && record.organAbnormalityNote
                    ? `（${record.organAbnormalityNote}）`
                    : ''
                }`,
              record.odorAbnormality &&
                `臭気の異常：${presenceLabel(record.odorAbnormality)}${
                  record.odorAbnormality === 'yes' && record.odorAbnormalityNote
                    ? `（${record.odorAbnormalityNote}）`
                    : ''
                }`,
            )}
          </Row>
          <Row label="運搬時の冷却状況">
            {join(
              record.cooling && `冷却：${presenceLabel(record.cooling)}`,
              record.coolingStartedAt && `開始時刻：${record.coolingStartedAt}`,
              record.coolingMethod && `方法：${record.coolingMethod}`,
            )}
          </Row>
          <Row label="施設（または移動式解体処理車）への搬入日時">
            {join(
              formatGibierDateTime(record.deliveredAt),
              elapsed.kind === 'ok' && `（放血開始から ${formatGibierDuration(elapsed.minutes)}）`,
            )}
          </Row>
          <Row label="その他特記事項">
            <span className={styles.notes}>{record.notes}</span>
          </Row>
        </tbody>
      </table>

      <p className={styles.section}>2. 個体に関する情報</p>
      <table className={styles.table}>
        <tbody>
          <Row label="性別、妊娠の有無">
            {join(
              record.sex === 'male' ? 'オス' : record.sex === 'female' ? 'メス' : '',
              record.sex === 'female' && record.pregnant && `妊娠：${presenceLabel(record.pregnant)}`,
            )}
          </Row>
          <Row label="推定年齢">{record.estimatedAge && `${record.estimatedAge} 歳前後`}</Row>
          <Row label="体重">{record.weightKg && `${record.weightKg} kg`}</Row>
        </tbody>
      </table>
      <table className={styles.table}>
        <caption className={styles.caption}>異常の確認</caption>
        <tbody>
          {GIBIER_ABNORMALITY_KEYS.map((key) => (
            <tr key={key}>
              <th scope="row">{GIBIER_ABNORMALITIES[key].form}</th>
              <td className={styles.answer}>{answerLabel(record.abnormalities[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className={styles.table}>
        <tbody>
          <Row label="受入の可否（施設記入）">受入：　可　／　不可　　（不可の理由：　　　　　　　　　　）</Row>
          <Row label="受入個体管理番号（施設記入）">{''}</Row>
        </tbody>
      </table>
      <p className={styles.footnote}>
        ※ 様式 2 に欄がなく、ガイドライン 第 3（6）ホ・ヌに基づいて追加した項目。異常の確認は様式 2
        の文言で、「舌」「水疱」はガイドラインの表記に合わせています。
        空欄は未入力です。該当しない項目は、提出前に斜線等を記入してください。出典：{GIBIER_SOURCES.guideline.name}（
        {GIBIER_SOURCES.guideline.note}）、{GIBIER_SOURCES.handbookForms.name}。
      </p>
    </div>
  );
}
