import type { CourseLinks } from './course-schedules';

/**
 * Official pages with the schedules of the hunting licence exam (prefectural wildlife offices), the
 * firearms safety course and the skills course (prefectural police), opened and checked on
 * COURSE_LINKS_CHECKED_ON. Only pages found and read are listed; a prefecture or a kind missing here
 * is one not yet collected. `yearSpecific` marks a page for one year's schedule, whose address is
 * likely to change next year.
 */
export const COURSE_LINKS_CHECKED_ON = '2026-09-24';

export const COURSE_LINKS: readonly CourseLinks[] = [
  {
    prefecture: '北海道',
    huntingExam: {
      title: '北海道の狩猟免許試験のお知らせ - 環境生活部自然環境局',
      url: 'https://www.pref.hokkaido.lg.jp/ks/skn/syuryo/syuryoumenkyo.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '宮城県',
    firearmsCourse: {
      title: '猟銃等講習会（初心者）開催日程',
      url: 'https://www.police.pref.miyagi.jp/seian/kyoninka/kyokasinsei/ryoujuu_syosinsya_kousyu.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '埼玉県',
    firearmsCourse: {
      title: '講習会開催のお知らせ(猟銃等・初心者講習) - 埼玉県警察',
      url: 'https://www.police.pref.saitama.lg.jp/c0050/shinse/ju-kousyu1.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '千葉県',
    firearmsCourse: {
      title:
        '経験者講習会（猟銃及び空気銃の取扱いに関する講習会） | 猟銃等・クロスボウ講習会 年少射撃資格講習会 | 千葉県警察',
      url: 'https://www.police.pref.chiba.jp/fuhoka/window_hunting_school-00_02.html',
      yearSpecific: false,
    },
    skillCourse: {
      title:
        '技能講習（猟銃の操作及び射撃の技能に関する講習） | 猟銃等・クロスボウ講習会 年少射撃資格講習会 | 千葉県警察',
      url: 'https://www.police.pref.chiba.jp/fuhoka/window_hunting_school-00_04.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '東京都',
    huntingExam: {
      title: '狩猟免許及び狩猟者登録｜鳥獣保護管理対策｜東京都環境局',
      url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/birds/hunting_license',
      yearSpecific: false,
    },
    firearmsCourse: {
      title: '猟銃等講習会の日程 初心者・経験者・年少射撃資格講習 警視庁',
      url: 'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/welcome/event_koshu/koshu/koshukai.html',
      yearSpecific: false,
    },
    skillCourse: {
      title: '技能講習の日程 警視庁',
      url: 'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/welcome/event_koshu/koshu/koshukai2.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '神奈川県',
    firearmsCourse: {
      title: '猟銃等講習会及び技能講習開催のお知らせ/神奈川県警察',
      url: 'https://www.police.pref.kanagawa.jp/tetsuzuki/koshu/mesd0072.html',
      yearSpecific: false,
    },
    skillCourse: {
      title: '猟銃等講習会及び技能講習開催のお知らせ/神奈川県警察',
      url: 'https://www.police.pref.kanagawa.jp/tetsuzuki/koshu/mesd0072.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '新潟県',
    firearmsCourse: {
      title: '猟銃等講習会及び技能講習 - 新潟県ホームページ',
      url: 'https://www.pref.niigata.lg.jp/site/kenkei/tetuzuki-keibigyou-1-ryoujuu-ryoujuu-kousyuu.html',
      yearSpecific: false,
    },
    skillCourse: {
      title: '猟銃等講習会及び技能講習 - 新潟県ホームページ',
      url: 'https://www.pref.niigata.lg.jp/site/kenkei/tetuzuki-keibigyou-1-ryoujuu-ryoujuu-kousyuu.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '富山県',
    huntingExam: {
      title: '富山県／令和8年度狩猟免許試験の実施について',
      url: 'https://www.pref.toyama.jp/1709/kurashi/kankyoushizen/shizen/shuryou/shiken.html',
      yearSpecific: true,
    },
    firearmsCourse: {
      title: '初心者講習の開催（令和8年度）｜富山県警察',
      url: 'https://police.pref.toyama.jp/6108/anzen/seikatsuanzen/juuhoutoukenrui/kj00010340/kj00010340-001-01.html',
      yearSpecific: true,
    },
  },
  {
    prefecture: '長野県',
    skillCourse: {
      title: '猟銃の技能講習開催のお知らせ／長野県警察',
      url: 'https://www.pref.nagano.lg.jp/police/shinsei/seian/ryouju/ginou.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '静岡県',
    firearmsCourse: {
      title: '猟銃等所持許可関係｜静岡県警察',
      url: 'https://www.pref.shizuoka.jp/police/shinse/seikatsu/ryoju/index.html',
      yearSpecific: false,
    },
  },
  {
    prefecture: '京都府',
    huntingExam: {
      title: '令和8年度狩猟免許試験の御案内／京都府ホームページ',
      url: 'https://www.pref.kyoto.jp/noson/syuryouexam.html',
      yearSpecific: true,
    },
  },
  {
    prefecture: '兵庫県',
    huntingExam: {
      title: '兵庫県／令和8年度狩猟免許試験案内',
      url: 'https://web.pref.hyogo.lg.jp/nk27/hw24_000000008.html',
      yearSpecific: true,
    },
    firearmsCourse: {
      title: '兵庫県警察 初心者用猟銃等講習会',
      url: 'https://www.police.pref.hyogo.lg.jp/tetuduki/ryoju/index.htm',
      yearSpecific: false,
    },
  },
  {
    prefecture: '広島県',
    firearmsCourse: {
      title: '令和８年度猟銃等講習会開催日程について | 広島県警察',
      url: 'https://www.pref.hiroshima.lg.jp/site/police/kousyuukai20260220.html',
      yearSpecific: true,
    },
  },
  {
    prefecture: '長崎県',
    firearmsCourse: {
      title: '猟銃等に関する講習日程［銃砲刀剣関係］ ｜ 長崎県警察（Nagasaki Prefectural Police）',
      url: 'https://www.police.pref.nagasaki.jp/police/shinsei/juuhoutouken/oshirase/',
      yearSpecific: false,
    },
    skillCourse: {
      title: '猟銃等に関する講習日程［銃砲刀剣関係］ ｜ 長崎県警察（Nagasaki Prefectural Police）',
      url: 'https://www.police.pref.nagasaki.jp/police/shinsei/juuhoutouken/oshirase/',
      yearSpecific: false,
    },
  },
];
