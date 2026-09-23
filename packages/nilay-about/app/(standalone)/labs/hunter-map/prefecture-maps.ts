/**
 * Prefectural pages that publish the map of wildlife protection areas and other restricted areas
 * (鳥獣保護区等位置図). Only pages opened on the date below and found on the prefecture's own site,
 * posting the map or naming where it is issued, are listed. A prefecture missing here is one not yet
 * confirmed, not one without a map.
 */
export const prefectureMapsCheckedOn = '2026-09-23';

export const prefectureMaps: readonly { prefecture: string; prefectureEn: string; url: string }[] = [
  { prefecture: '北海道', prefectureEn: 'Hokkaido', url: 'https://www.pref.hokkaido.lg.jp/ks/skn/syuryo/ichizu.html' },
  {
    prefecture: '青森県',
    prefectureEn: 'Aomori',
    url: 'https://www.pref.aomori.lg.jp/soshiki/kankyo/shizen/huntermap.html',
  },
  {
    prefecture: '岩手県',
    prefectureEn: 'Iwate',
    url: 'https://www.pref.iwate.jp/kurashikankyou/shizen/yasei/1005511.html',
  },
  { prefecture: '宮城県', prefectureEn: 'Miyagi', url: 'https://www.pref.miyagi.jp/soshiki/sizenhogo/ichizu.html' },
  { prefecture: '秋田県', prefectureEn: 'Akita', url: 'https://www.pref.akita.lg.jp/pages/archive/266' },
  {
    prefecture: '山形県',
    prefectureEn: 'Yamagata',
    url: 'https://www.pref.yamagata.jp/050011/kurashi/shizen/seibutsu/about_hunting/about_hunting.html',
  },
  {
    prefecture: '福島県',
    prefectureEn: 'Fukushima',
    url: 'https://www.pref.fukushima.lg.jp/sec/16035b/r7-tyoujyuuhogoku.html',
  },
  {
    prefecture: '茨城県',
    prefectureEn: 'Ibaraki',
    url: 'https://www.pref.ibaraki.jp/seikatsukankyo/shizen/chojyuhogo/hunter-map.html',
  },
  {
    prefecture: '栃木県',
    prefectureEn: 'Tochigi',
    url: 'https://www.pref.tochigi.lg.jp/d04/eco/shizenkankyou/shizen/tyoujyuuhogokutouitizu-zenntai.html',
  },
  { prefecture: '群馬県', prefectureEn: 'Gunma', url: 'https://www.pref.gunma.jp/page/7030.html' },
  { prefecture: '埼玉県', prefectureEn: 'Saitama', url: 'https://www.pref.saitama.lg.jp/a0508/hunter-map.html' },
  {
    prefecture: '千葉県',
    prefectureEn: 'Chiba',
    url: 'https://www.pref.chiba.lg.jp/shizen/choujuu/hogoku/hogoku-gaiyou.html',
  },
  {
    prefecture: '東京都',
    prefectureEn: 'Tokyo',
    url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/birds/hunting_license/hunter_map',
  },
  {
    prefecture: '神奈川県',
    prefectureEn: 'Kanagawa',
    url: 'https://www.pref.kanagawa.jp/docs/t4i/cnt/f986/p889837.html',
  },
  {
    prefecture: '新潟県',
    prefectureEn: 'Niigata',
    url: 'https://www.pref.niigata.lg.jp/sec/kankyotaisaku/tyoujyuuhogoku2025.html',
  },
  {
    prefecture: '富山県',
    prefectureEn: 'Toyama',
    url: 'https://www.pref.toyama.jp/1709/kurashi/kankyoushizen/shizen/shuryou/huntermap.html',
  },
  { prefecture: '石川県', prefectureEn: 'Ishikawa', url: 'https://www.pref.ishikawa.lg.jp/sizen/kankyo/10.html' },
  {
    prefecture: '福井県',
    prefectureEn: 'Fukui',
    url: 'https://www.pref.fukui.lg.jp/doc/shizen/syuryo/syuryou_kuiki.html',
  },
  { prefecture: '山梨県', prefectureEn: 'Yamanashi', url: 'https://www.pref.yamanashi.jp/shizen/23huntermap2.html' },
  {
    prefecture: '長野県',
    prefectureEn: 'Nagano',
    url: 'https://www.pref.nagano.lg.jp/yasei/sangyo/ringyo/shuryo/hogozu/index.html',
  },
  { prefecture: '岐阜県', prefectureEn: 'Gifu', url: 'https://www.pref.gifu.lg.jp/page/10885.html' },
  {
    prefecture: '静岡県',
    prefectureEn: 'Shizuoka',
    url: 'https://www.pref.shizuoka.jp/kurashikankyo/shizenkankyo/wild/1017696.html',
  },
  { prefecture: '愛知県', prefectureEn: 'Aichi', url: 'https://www.pref.aichi.jp/soshiki/shizen/map.html' },
  { prefecture: '三重県', prefectureEn: 'Mie', url: 'https://www.pref.mie.lg.jp/SHINRIN/HP/mori/000126727.htm' },
  { prefecture: '滋賀県', prefectureEn: 'Shiga', url: 'https://www.pref.shiga.lg.jp/dg00/3545.html' },
  {
    prefecture: '大阪府',
    prefectureEn: 'Osaka',
    url: 'https://www.pref.osaka.lg.jp/o120140/doubutu/yaseidoubutu/hogoku-itizu.html',
  },
  { prefecture: '兵庫県', prefectureEn: 'Hyogo', url: 'https://web.pref.hyogo.lg.jp/nk27/hw24_000000011.html' },
  {
    prefecture: '和歌山県',
    prefectureEn: 'Wakayama',
    url: 'https://www.pref.wakayama.lg.jp/prefg/032600/yasei/chojuhogokumap.html',
  },
  { prefecture: '鳥取県', prefectureEn: 'Tottori', url: 'https://www.pref.tottori.lg.jp/289615.htm' },
  {
    prefecture: '島根県',
    prefectureEn: 'Shimane',
    url: 'https://www.pref.shimane.lg.jp/industry/norin/choujyu_taisaku/cyojyu_hogoku_tou_sitei_jyokyo.html',
  },
  { prefecture: '岡山県', prefectureEn: 'Okayama', url: 'https://www.pref.okayama.jp/page/356248.html' },
  {
    prefecture: '広島県',
    prefectureEn: 'Hiroshima',
    url: 'https://www.pref.hiroshima.lg.jp/site/huntinglicense/hunter-map.html',
  },
  {
    prefecture: '徳島県',
    prefectureEn: 'Tokushima',
    url: 'https://www.pref.tokushima.lg.jp/ippannokata/kurashi/shizen/7314042/',
  },
  { prefecture: '愛媛県', prefectureEn: 'Ehime', url: 'https://www.pref.ehime.jp/page/17936.html' },
  { prefecture: '高知県', prefectureEn: 'Kochi', url: 'https://www.pref.kochi.lg.jp/doc/2025103100103/' },
  {
    prefecture: '福岡県',
    prefectureEn: 'Fukuoka',
    url: 'https://www.pref.fukuoka.lg.jp/gyosei-shiryo/tyoujyuuhogokutou.html',
  },
  { prefecture: '佐賀県', prefectureEn: 'Saga', url: 'https://www.pref.saga.lg.jp/kiji00321970/index.html' },
  {
    prefecture: '長崎県',
    prefectureEn: 'Nagasaki',
    url: 'https://www.pref.nagasaki.jp/bunrui/shigoto-sangyo/nogyo/nosansonshiko/chojutaisaku/hunting/',
  },
  { prefecture: '熊本県', prefectureEn: 'Kumamoto', url: 'https://www.pref.kumamoto.jp/soshiki/52/249903.html' },
  { prefecture: '大分県', prefectureEn: 'Oita', url: 'https://www.pref.oita.jp/soshiki/16210/hogokanri.html' },
  {
    prefecture: '宮崎県',
    prefectureEn: 'Miyazaki',
    url: 'https://www.pref.miyazaki.lg.jp/shizen/kurashi/shizen/20200914175407.html',
  },
  {
    prefecture: '鹿児島県',
    prefectureEn: 'Kagoshima',
    url: 'https://www.pref.kagoshima.jp/ad04/kurashi-kankyo/kankyo/yasei/hogo/e5030709.html',
  },
  {
    prefecture: '沖縄県',
    prefectureEn: 'Okinawa',
    url: 'https://www.pref.okinawa.lg.jp/kurashikankyo/shizenseibutsu/1018702/1029255.html',
  },
];
