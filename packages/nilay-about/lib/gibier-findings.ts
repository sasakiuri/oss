/**
 * How to tell an abnormal animal at each stage of handling, taken from the MHLW colour atlas that the
 * guideline names as its reference (別紙カラーアトラス) and from the guideline itself.
 *
 * Every finding carries the decision the source attaches to it and where it says so. Nothing here is
 * a diagnosis: the atlas shows what to look for, and the guideline's rule is that anything that cannot
 * be judged safe is thrown away (第 1 の 1（2）).
 */

export const GIBIER_FINDINGS_CHECKED_ON = '2026-09-24';

export const GIBIER_ATLAS_SOURCE = {
  name: '「野生鳥獣肉の衛生管理に関する指針（ガイドライン）」別紙 カラーアトラス',
  note: '厚生労働省、平成 26 年 11 月 14 日（最終改正 令和 7 年 3 月 19 日、健生発 0319 第 6 号）',
  url: 'https://www.mhlw.go.jp/content/001455714.pdf',
} as const;

/** The stage of handling at which the finding is seen. */
export type GibierFindingStage = 'capture' | 'bleeding' | 'opening' | 'organs' | 'carcass';

export const GIBIER_FINDING_STAGES: readonly { id: GibierFindingStage; title: string }[] = [
  { id: 'capture', title: '捕獲前後（外見・頭部・天然孔）' },
  { id: 'bleeding', title: '放血' },
  { id: 'opening', title: '胸・腹を開けたとき' },
  { id: 'organs', title: '内臓' },
  { id: 'carcass', title: '剥皮後・枝肉' },
];

/**
 * What the source says to do:
 * - `notDressed`: 捕獲、解体しない（解体を中止する）
 * - `whole`: 枝肉、内臓を全部廃棄
 * - `organ`: その臓器を廃棄
 * - `trim`: その部位を切り取り、食用にしない
 */
export type GibierFindingAction = 'notDressed' | 'whole' | 'organ' | 'trim';

export const GIBIER_FINDING_ACTION_LABELS: Record<GibierFindingAction, string> = {
  notDressed: '捕獲・解体しない（解体を中止する）',
  whole: '枝肉・内臓を全部廃棄',
  organ: 'その臓器を廃棄',
  trim: 'その部位を切り取る',
};

export interface GibierFinding {
  stage: GibierFindingStage;
  /** Where it is seen, such as 心臓 or 肝臓. */
  site: string;
  /** Which species the source shows it for. Items the atlas shows only in cattle or pigs say so in `note`. */
  species: 'deer' | 'boar' | 'both';
  /** What is seen, in the source's words. */
  sign: string;
  /** What the source gives as the cause, if it gives one. */
  cause?: string;
  actions: readonly GibierFindingAction[];
  /** The atlas page (printed number) or the guideline section. */
  where: string;
  /** Anything the reader needs to weigh the entry, such as a photo that is of a pig. */
  note?: string;
  /** The source names it as a disease that also infects people. */
  zoonosis?: boolean;
}

export const GIBIER_FINDINGS: readonly GibierFinding[] = [
  // 捕獲前後
  {
    stage: 'capture',
    site: '天然孔（肛門・鼻孔）',
    species: 'both',
    sign: '黒い、タール状の出血がみられる',
    cause: '炭疽の可能性',
    actions: ['notDressed'],
    where: 'カラーアトラス p.20・p.40「血液の異常について」',
    zoonosis: true,
  },
  {
    stage: 'capture',
    site: '頭部',
    species: 'boar',
    sign: '鼻先、口の中、舌にただれ・出血がある。口の中・目の粘膜が黄色い（黄疸）。チアノーゼ（紫色に染まる）がある。奇形・腫瘤等がある',
    actions: [],
    where: 'カラーアトラス p.40「頭部 確認事項」',
    note: 'アトラスは確認事項として挙げています。当てはまれば、ガイドライン 第 2 の 2（1）の異常として食用にしません。',
  },
  {
    stage: 'capture',
    site: '全身',
    species: 'both',
    sign: '重度に痩せている（削痩）。毛並みが悪く、被毛が薄い',
    actions: ['notDressed'],
    where: 'カラーアトラス p.40・p.44「削痩」',
  },
  {
    stage: 'capture',
    site: '全身',
    species: 'both',
    sign: '膿瘍がみられる',
    cause: '膿毒症',
    actions: ['notDressed'],
    where: 'カラーアトラス p.46「膿毒症」',
    note: 'アトラスの写真は豚です。',
  },
  {
    stage: 'capture',
    site: '皮膚',
    species: 'boar',
    sign: '剥皮前の皮膚にチアノーゼ（紫色に染まる）がみられる',
    cause: '豚丹毒（敗血症型）。胃・腸管・腎臓など内臓に出血がみられることもある',
    actions: ['notDressed', 'whole'],
    where: 'カラーアトラス p.48「豚丹毒（敗血症型）」',
    note: 'アトラスの写真は豚です。',
    zoonosis: true,
  },
  {
    stage: 'capture',
    site: '全身',
    species: 'deer',
    sign: '頭と首を後ろに反り返している（後弓反張）、四肢を伸ばして固まっている（強直性けいれん）',
    cause: '破傷風',
    actions: ['notDressed'],
    where: 'カラーアトラス p.51「破傷風」',
    note: 'アトラスの写真は牛です。',
    zoonosis: true,
  },
  // 放血
  {
    stage: 'bleeding',
    site: '血液',
    species: 'both',
    sign: '放血後の血液が固まらない、または固まりにくい（凝固不全）',
    cause: '炭疽の可能性',
    actions: ['notDressed'],
    where: 'カラーアトラス p.20・p.40「血液の異常について」',
    zoonosis: true,
  },
  {
    stage: 'bleeding',
    site: '体温',
    species: 'deer',
    sign: '摂氏 40 度を超える',
    actions: ['notDressed'],
    where: 'カラーアトラス p.20「体温の異常について」',
    note: '手引書の様式 2 と「放血」の項は「40℃以上」としています。',
  },
  {
    stage: 'bleeding',
    site: '体温',
    species: 'boar',
    sign: '摂氏 42 度を超える',
    actions: ['notDressed'],
    where: 'カラーアトラス p.40「体温の異常について」',
    note: '手引書の様式 2 と「放血」の項は「42℃以上」としています。',
  },
  // 胸・腹を開けたとき
  {
    stage: 'opening',
    site: '胸腔・腹腔',
    species: 'both',
    sign: '血液以外の液体（腹水や胸水）が溜まっている',
    actions: ['whole'],
    where: 'カラーアトラス p.10・p.25',
  },
  {
    stage: 'opening',
    site: '消化管',
    species: 'both',
    sign: '消化管を破損し、内容物が漏れ出た',
    actions: ['whole'],
    where: 'ガイドライン 第 2 の 4（6）「その個体は食用としないこと」',
  },
  // 内臓
  {
    stage: 'organs',
    site: '心臓',
    species: 'both',
    sign: '心筋に白色で粟粒から小豆ほどの大きさの結節がある',
    cause: '寄生虫に感染している可能性（枝肉にも寄生することがある）',
    actions: ['whole'],
    where: 'カラーアトラス p.11・p.29',
  },
  {
    stage: 'organs',
    site: '心臓',
    species: 'both',
    sign: '弁に疣（いぼ）状のものがある（色や形、表面の質感は様々）',
    cause: '弁に付着した細菌が混ざった血栓。細菌が筋肉を含む全身に広がっていることがある',
    actions: ['whole'],
    where: 'カラーアトラス p.11・p.29・p.30',
    note: 'p.30 の写真は豚の疣贅性心内膜炎です。心臓は必ず切開し、内面、すべての弁、割面を確認します（p.11・p.29）。',
  },
  {
    stage: 'organs',
    site: '心臓',
    species: 'deer',
    sign: '心冠部の脂肪組織がゼラチンのように水っぽい。心臓全体が白っぽい（貧血色）',
    actions: ['organ'],
    where: 'カラーアトラス p.12',
  },
  {
    stage: 'organs',
    site: '肺',
    species: 'both',
    sign: '膿瘍（クリームのような膿、表面にやや盛り上がる）',
    actions: ['whole'],
    where: 'カラーアトラス p.13・p.28',
    note: 'アトラスの写真は牛と豚です。',
  },
  {
    stage: 'organs',
    site: '肺',
    species: 'deer',
    sign: '胸膜の一部が厚く白くなり、表面がザラザラしている',
    cause: '胸膜炎',
    actions: ['organ'],
    where: 'カラーアトラス p.13',
  },
  {
    stage: 'organs',
    site: '肺',
    species: 'boar',
    sign: '周縁部に表面からやや盛り上がった白色の部分がある（肺気腫）。気管支内に寄生虫（肺虫）がみられる',
    actions: ['organ'],
    where: 'カラーアトラス p.27',
  },
  {
    stage: 'organs',
    site: '肝臓',
    species: 'both',
    sign: '表面に盛り上がった白色の結節',
    cause: '肝膿瘍',
    actions: ['whole'],
    where: 'カラーアトラス p.14・p.31',
  },
  {
    stage: 'organs',
    site: '肝臓',
    species: 'deer',
    sign: '表面にのう胞（液体を入れた袋）がある。辺縁に白色の病巣がある',
    actions: ['whole'],
    where: 'カラーアトラス p.15',
  },
  {
    stage: 'organs',
    site: '肝臓',
    species: 'deer',
    sign: '表面に盛り上がる白色の管状の病変があり凹凸がある（胆管が分厚くなって浮き出ている）',
    cause: '寄生虫（肝蛭）',
    actions: ['organ'],
    where: 'カラーアトラス p.16',
  },
  {
    stage: 'organs',
    site: '肝臓',
    species: 'boar',
    sign: '白い網目状の病変（ミルクスポット）がある',
    cause: '肝間質炎',
    actions: ['organ'],
    where: 'カラーアトラス p.32',
  },
  {
    stage: 'organs',
    site: '肝臓',
    species: 'boar',
    sign: '表面がザラザラしている（線維素付着）',
    cause: '肝包膜炎',
    actions: ['organ'],
    where: 'カラーアトラス p.32',
  },
  {
    stage: 'organs',
    site: '脾臓',
    species: 'boar',
    sign: '表面（漿膜）がザラザラしている',
    cause: '線維素付着、漿膜炎',
    actions: ['organ'],
    where: 'カラーアトラス p.33',
  },
  {
    stage: 'organs',
    site: '脾臓',
    species: 'both',
    sign: '高度に腫大し、軟らかくなっている。病変部（皮膚、腸管など）の出血',
    cause: '炭疽',
    actions: ['whole'],
    where: 'カラーアトラス p.52「炭疽」',
    note: 'アトラスの写真は牛と豚です。',
    zoonosis: true,
  },
  {
    stage: 'organs',
    site: '腎臓',
    species: 'both',
    sign: '黒色にみえるのう胞、白色の病巣、変形（小さく表面が球状に盛り上がる、水腎症）、表面の凹凸と中心部の硬さ',
    actions: ['whole'],
    where: 'カラーアトラス p.18・p.19（シカ）、p.35（イノシシ）',
  },
  {
    stage: 'organs',
    site: '腎臓',
    species: 'boar',
    sign: '尿管が厚く硬くなっている。虫体を含む結節',
    cause: '寄生虫（腎虫）',
    actions: ['organ'],
    where: 'カラーアトラス p.36',
  },
  {
    stage: 'organs',
    site: '胃',
    species: 'boar',
    sign: '胃の表面（漿膜面）にザラザラした病変がある。粘膜面に寄生虫や潰瘍（えぐれた病変）がある',
    cause: '線維素性腹膜炎、体内移行中の豚腎虫、ドロレス顎口虫',
    actions: ['organ'],
    where: 'カラーアトラス p.38・p.39',
    note: '通常の確認では、胃は切開せず表面から確認します。',
  },
  {
    stage: 'organs',
    site: '腸管',
    species: 'deer',
    sign: '小腸内部の粘膜が厚くなり「わらじ」状にみえる',
    cause: 'ヨーネ病',
    actions: ['whole'],
    where: 'カラーアトラス p.20',
    note: 'アトラスの写真は牛です。腸管の確認事項は、表面が滑らか、癒着がない、リンパ節が腫れていない、出血していない、狭窄や硬さがないことです。',
  },
  {
    stage: 'organs',
    site: 'リンパ節・腫瘍・臭気',
    species: 'both',
    sign: '複数のリンパ節の腫脹や出血、腫瘍、臭気の異常',
    cause: '全身性の疾病の恐れ',
    actions: ['whole'],
    where: 'カラーアトラス p.4「廃棄の判断」、ガイドライン 第 4 の 4（2）①',
  },
  // 剥皮後・枝肉
  {
    stage: 'carcass',
    site: '筋肉',
    species: 'deer',
    sign: '筋肉内に白色の筋がみられる',
    cause: '寄生虫に感染している可能性（枝肉全体や心臓、横隔膜などにも寄生することがある）',
    actions: ['whole'],
    where: 'カラーアトラス p.22',
  },
  {
    stage: 'carcass',
    site: '筋肉',
    species: 'both',
    sign: '筋肉内の腫瘤（多数の白色結節、透明な袋を含む）',
    cause: '膿毒症や全身性腫瘍と肉眼では区別できない。寄生虫（嚢虫）',
    actions: ['whole'],
    where: 'ガイドライン 第 4 の 4（2）②、カラーアトラス p.4・p.22・p.42',
    note: 'p.22・p.42 の嚢虫の写真は牛と豚です。',
  },
  {
    stage: 'carcass',
    site: '脂肪',
    species: 'both',
    sign: '剥皮後の皮下脂肪や内臓脂肪が全体的に黄色い（眼の結膜、肝臓なども黄色くなることがある）',
    cause: '黄疸',
    actions: ['whole'],
    where: 'カラーアトラス p.45',
    note: 'アトラスの写真は牛です。',
  },
  {
    stage: 'carcass',
    site: '皮膚・枝肉',
    species: 'boar',
    sign: '剥皮後に、菱形の蕁麻疹が枝肉にみられる',
    cause: '豚丹毒（蕁麻疹型）',
    actions: ['notDressed', 'whole'],
    where: 'カラーアトラス p.47',
    note: 'イノシシは被毛が太く長いため、剥皮前に確認するのは困難です。アトラスの写真は豚です。',
    zoonosis: true,
  },
  {
    stage: 'carcass',
    site: 'リンパ節・関節',
    species: 'boar',
    sign: 'リンパ節の腫大や出血と、その近くの関節などの炎症',
    cause: '豚丹毒（関節炎型）',
    actions: ['whole'],
    where: 'カラーアトラス p.49',
    note: 'アトラスの写真は豚です。',
    zoonosis: true,
  },
  {
    stage: 'carcass',
    site: '肺・大網',
    species: 'deer',
    sign: '肺の内部に黄白色のチーズ様の塊。胃の表面の腹膜（大網）に数珠状の結節が多数',
    cause: '結核',
    actions: ['whole'],
    where: 'カラーアトラス p.50',
    note: 'アトラスの写真は牛です。',
    zoonosis: true,
  },
  {
    stage: 'carcass',
    site: '着弾部位',
    species: 'both',
    sign: '着弾部位（弾丸が通過した部分を含む）の肉',
    cause: '汚染されている可能性',
    actions: ['trim'],
    where: 'ガイドライン 第 4 の 5（5）イ',
  },
  {
    stage: 'carcass',
    site: '剥皮・内臓摘出した部分',
    species: 'both',
    sign: '外皮、被毛、消化管の内容物で汚染された',
    actions: ['trim'],
    where: 'ガイドライン 第 4 の 5（2）ハ・ホ、（3）ホ、（5）イ',
  },
];

/** The atlas's general rules on what to throw away (p.4「3 廃棄の判断」), as printed. */
export const GIBIER_DISCARD_RULES: readonly string[] = [
  '肉眼的に異常が認められない場合も、微生物及び寄生虫の感染のおそれがあるため、可能な限り、内臓については廃棄することが望ましい。',
  '内臓摘出時に肉眼的異常が認められた場合、その内臓は全部廃棄とすること。',
  '複数のリンパ節の腫脹や出血、腹水や胸水の貯留、腫瘍、臭気の異常等が認められた場合は、全身性の疾病の恐れがあることから、枝肉、内臓を全部廃棄とすること。',
  '筋肉内の腫瘤について、肉眼的に膿毒症や全身性腫瘍との区別は困難であることから、筋肉を含め全部廃棄とすること。',
];

export const gibierFindingsFor = (stage: GibierFindingStage, species: 'deer' | 'boar' | 'all') =>
  GIBIER_FINDINGS.filter(
    (finding) =>
      finding.stage === stage && (species === 'all' || finding.species === 'both' || finding.species === species),
  );
