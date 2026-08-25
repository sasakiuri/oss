export interface Stage1Series {
  first5: number[];
  second5: number[];
  first5Total: number;
  second5Total: number;
}

export function calculateStage1Series(stage1Shots: number[]): Stage1Series {
  const first5 = stage1Shots.slice(0, 5);
  const second5 = stage1Shots.slice(5, 10);
  const first5Total = first5.reduce((sum, s) => sum + s, 0);
  const second5Total = second5.reduce((sum, s) => sum + s, 0);

  return { first5, second5, first5Total, second5Total };
}
