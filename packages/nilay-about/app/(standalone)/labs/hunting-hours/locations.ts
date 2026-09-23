export interface PresetLocation {
  /** JIS prefecture code, so the list keeps the order Japanese forms use. */
  id: string;
  prefecture: { ja: string; en: string };
  city: { ja: string; en: string };
  latitude: number;
  longitude: number;
}

type PresetRow = [
  id: string,
  prefectureJa: string,
  prefectureEn: string,
  cityJa: string,
  cityEn: string,
  latitude: number,
  longitude: number,
];

/**
 * Representative point of every prefectural capital, as published by the National Astronomical
 * Observatory of Japan in 各地のこよみ (https://eco.mtk.nao.ac.jp/koyomi/dni/, read 2026-09-22).
 * They are city reference points, not hunting grounds.
 */
const rows: PresetRow[] = [
  ['01', '北海道', 'Hokkaido', '札幌', 'Sapporo', 43.0667, 141.35],
  ['02', '青森県', 'Aomori', '青森', 'Aomori', 40.8167, 140.7333],
  ['03', '岩手県', 'Iwate', '盛岡', 'Morioka', 39.7, 141.15],
  ['04', '宮城県', 'Miyagi', '仙台', 'Sendai', 38.2667, 140.8667],
  ['05', '秋田県', 'Akita', '秋田', 'Akita', 39.7167, 140.1167],
  ['06', '山形県', 'Yamagata', '山形', 'Yamagata', 38.25, 140.35],
  ['07', '福島県', 'Fukushima', '福島', 'Fukushima', 37.75, 140.4667],
  ['08', '茨城県', 'Ibaraki', '水戸', 'Mito', 36.3667, 140.4833],
  ['09', '栃木県', 'Tochigi', '宇都宮', 'Utsunomiya', 36.5667, 139.8833],
  ['10', '群馬県', 'Gunma', '前橋', 'Maebashi', 36.3833, 139.0667],
  ['11', '埼玉県', 'Saitama', 'さいたま', 'Saitama', 35.85, 139.65],
  ['12', '千葉県', 'Chiba', '千葉', 'Chiba', 35.6, 140.1167],
  ['13', '東京都', 'Tokyo', '東京', 'Tokyo', 35.6581, 139.7414],
  ['14', '神奈川県', 'Kanagawa', '横浜', 'Yokohama', 35.45, 139.65],
  ['15', '新潟県', 'Niigata', '新潟', 'Niigata', 37.9167, 139.0333],
  ['16', '富山県', 'Toyama', '富山', 'Toyama', 36.6833, 137.2167],
  ['17', '石川県', 'Ishikawa', '金沢', 'Kanazawa', 36.5667, 136.65],
  ['18', '福井県', 'Fukui', '福井', 'Fukui', 36.0667, 136.2167],
  ['19', '山梨県', 'Yamanashi', '甲府', 'Kofu', 35.6667, 138.5667],
  ['20', '長野県', 'Nagano', '長野', 'Nagano', 36.65, 138.1833],
  ['21', '岐阜県', 'Gifu', '岐阜', 'Gifu', 35.4167, 136.7667],
  ['22', '静岡県', 'Shizuoka', '静岡', 'Shizuoka', 34.9667, 138.3833],
  ['23', '愛知県', 'Aichi', '名古屋', 'Nagoya', 35.1667, 136.9167],
  ['24', '三重県', 'Mie', '津', 'Tsu', 34.7333, 136.5167],
  ['25', '滋賀県', 'Shiga', '大津', 'Otsu', 35, 135.8667],
  ['26', '京都府', 'Kyoto', '京都', 'Kyoto', 35.0167, 135.75],
  ['27', '大阪府', 'Osaka', '大阪', 'Osaka', 34.6833, 135.4833],
  ['28', '兵庫県', 'Hyogo', '神戸', 'Kobe', 34.6833, 135.1833],
  ['29', '奈良県', 'Nara', '奈良', 'Nara', 34.6833, 135.8333],
  ['30', '和歌山県', 'Wakayama', '和歌山', 'Wakayama', 34.2333, 135.1667],
  ['31', '鳥取県', 'Tottori', '鳥取', 'Tottori', 35.5, 134.2333],
  ['32', '島根県', 'Shimane', '松江', 'Matsue', 35.4667, 133.05],
  ['33', '岡山県', 'Okayama', '岡山', 'Okayama', 34.6667, 133.9333],
  ['34', '広島県', 'Hiroshima', '広島', 'Hiroshima', 34.3833, 132.45],
  ['35', '山口県', 'Yamaguchi', '山口', 'Yamaguchi', 34.1833, 131.4667],
  ['36', '徳島県', 'Tokushima', '徳島', 'Tokushima', 34.0667, 134.55],
  ['37', '香川県', 'Kagawa', '高松', 'Takamatsu', 34.35, 134.05],
  ['38', '愛媛県', 'Ehime', '松山', 'Matsuyama', 33.8333, 132.7667],
  ['39', '高知県', 'Kochi', '高知', 'Kochi', 33.55, 133.5333],
  ['40', '福岡県', 'Fukuoka', '福岡', 'Fukuoka', 33.5833, 130.4],
  ['41', '佐賀県', 'Saga', '佐賀', 'Saga', 33.25, 130.3],
  ['42', '長崎県', 'Nagasaki', '長崎', 'Nagasaki', 32.75, 129.8667],
  ['43', '熊本県', 'Kumamoto', '熊本', 'Kumamoto', 32.8, 130.7167],
  ['44', '大分県', 'Oita', '大分', 'Oita', 33.2333, 131.6167],
  ['45', '宮崎県', 'Miyazaki', '宮崎', 'Miyazaki', 31.9, 131.4167],
  ['46', '鹿児島県', 'Kagoshima', '鹿児島', 'Kagoshima', 31.6, 130.55],
  ['47', '沖縄県', 'Okinawa', '那覇', 'Naha', 26.2167, 127.6667],
];

export const presetLocations: PresetLocation[] = rows.map(
  ([id, prefectureJa, prefectureEn, cityJa, cityEn, latitude, longitude]) => ({
    id,
    prefecture: { ja: prefectureJa, en: prefectureEn },
    city: { ja: cityJa, en: cityEn },
    latitude,
    longitude,
  }),
);

export const presetLocationMap = new Map(presetLocations.map((location) => [location.id, location]));

export function presetLocationLabel(location: PresetLocation, language: 'ja' | 'en'): string {
  return language === 'ja'
    ? `${location.prefecture.ja}（${location.city.ja}）`
    : `${location.prefecture.en} (${location.city.en})`;
}
