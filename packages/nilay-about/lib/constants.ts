export const ROUTES = {
  HOME: '/',
  NEWS: '/news',
  NEWS_DETAIL: (id: string) => `/news/${id}`,
  CONTACT: '/contact',
  LABS: '/labs',
  LABS_GAME_SPECIES: '/labs/game-species-test',
  LABS_HOME_TARGET: '/labs/home-target',
} as const;
