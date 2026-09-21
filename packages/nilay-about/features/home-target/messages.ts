export type HomeTargetText = {
  title: string;
  heightOfTargetCenter: string;
  blackAreaSize: string;
  eyeHeight: string;
  eyeHeightDesc: string;
  desiredDistance: string;
  desiredDistanceDesc: string;
  distance: string;
  discipline: string;
  disciplineDesc: string;
  shootingDistance: string;
  blackAimingAreaSize: string;
};

const enText: HomeTargetText = {
  title: 'Target Calculator',
  heightOfTargetCenter: 'Height of Target Center',
  blackAreaSize: 'Black Area Size',
  eyeHeight: 'Eye Height',
  eyeHeightDesc: 'Please enter the height from the floor to your eye.',
  desiredDistance: 'Desired Distance to Target',
  desiredDistanceDesc: 'Please enter the distance to the position where you want to place the target.',
  distance: 'Distance',
  discipline: 'Discipline',
  disciplineDesc: 'Please select the discipline ( or create custom discipline).',
  shootingDistance: 'Shooting Distance',
  blackAimingAreaSize: 'Black Aiming Area Size',
};

const jaText: HomeTargetText = {
  title: '標的を計算',
  heightOfTargetCenter: '標的の中心の高さ',
  blackAreaSize: '黒い領域の大きさ',
  eyeHeight: '目の高さ',
  eyeHeightDesc: '床から目までの高さを入力してください',
  desiredDistance: '標的を設置したい距離',
  desiredDistanceDesc: '標的を設置したい位置までの距離を入力してください。',
  distance: '距離',
  discipline: '種目',
  disciplineDesc: '種目を選択 (あるいはカスタム種目を作成) してください。',
  shootingDistance: '射撃距離',
  blackAimingAreaSize: '黒い領域のサイズ',
};

export const homeTargetText = { ja: jaText, en: enText };
