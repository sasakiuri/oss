import { ConditionSection } from '@/components/labs';

const LAW_URL = 'https://laws.e-gov.go.jp/law/414AC0000000088';

interface LegalNotesProps {
  language: 'ja' | 'en';
}

export function LegalNotes({ language }: LegalNotesProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const article = [
    t(
      '日出前及び日没後においては、銃猟をしてはならない。',
      'Hunting with firearms must not be carried out before sunrise or after sunset.',
    ),
    t(
      '住居が集合している地域又は広場、駅その他の多数の者の集合する場所（以下「住居集合地域等」という。）においては、銃猟をしてはならない。ただし、次条第一項の許可を受けて麻酔銃を使用した鳥獣の捕獲等（以下「麻酔銃猟」という。）をする場合は、この限りでない。',
      'Hunting with firearms must not be carried out in areas where dwellings are clustered, or in plazas, stations and other places where many people gather. This does not apply to capture using a tranquilliser gun under a permit granted under Article 39, paragraph 1.',
    ),
    t(
      '弾丸の到達するおそれのある人、飼養若しくは保管されている動物、建物又は電車、自動車、船舶その他の乗物に向かって、銃猟をしてはならない。',
      'Hunting with firearms must not be carried out towards any person, kept or captive animal, building, or vehicle such as a train, car or vessel that a bullet may reach.',
    ),
  ];
  const cautions = [
    t(
      '時刻は天文計算の値です。地形・天候・標高によって実際の明るさは異なります。',
      'Times are calculated. Terrain, weather and elevation change how light it actually is.',
    ),
    t(
      '夜間銃猟の認定や緊急銃猟などの例外があります。実際に撃てるかは、都道府県の規制と許可の条件で確認してください。',
      'Exceptions include authorised night shooting and emergency shooting. Check the prefecture’s rules and your permit conditions.',
    ),
  ];

  return (
    <ConditionSection
      id="legal"
      title={t('銃猟の制限（鳥獣保護管理法 第 38 条）', 'Restrictions on shooting (Article 38)')}
      summary={t(
        '日出前・日没後、住居が集まる場所、人や建物に向けての銃猟は禁止。例外もあり。',
        'No shooting before sunrise or after sunset, in built-up areas, or towards people or buildings. Some exceptions apply.',
      )}
    >
      <blockquote className="space-y-3 border-l-4 border-outline-variant bg-surface-container p-4 text-sm leading-relaxed">
        <p className="font-medium">
          {t(
            '鳥獣の保護及び管理並びに狩猟の適正化に関する法律（平成十四年法律第八十八号）第三十八条（銃猟の制限）',
            'Act on Wildlife Protection, Control and Hunting Management (Act No. 88 of 2002), Article 38 (Restrictions on hunting with firearms)',
          )}
        </p>
        <ol className="space-y-3">
          {article.map((paragraph, index) => (
            <li key={paragraph} className="flex gap-3">
              <span className="shrink-0 tabular-nums text-on-surface-variant" aria-hidden="true">
                {index + 1}
              </span>
              <p>{paragraph}</p>
            </li>
          ))}
        </ol>
        {language === 'en' && (
          <p className="text-on-surface-variant">
            Unofficial translation. Only the Japanese text of the Act is authoritative.
          </p>
        )}
      </blockquote>
      <ul className="divide-y divide-outline-variant border-y border-outline-variant text-sm leading-relaxed text-on-surface-variant">
        {cautions.map((caution) => (
          <li key={caution} className="py-3">
            {caution}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {t('出典：', 'Source: ')}
        <a href={LAW_URL} target="_blank" rel="noreferrer" className="underline">
          {t(
            'e-Gov 法令検索「鳥獣の保護及び管理並びに狩猟の適正化に関する法律」',
            'e-Gov Law Search: Act on Wildlife Protection, Control and Hunting Management',
          )}
        </a>
      </p>
    </ConditionSection>
  );
}
