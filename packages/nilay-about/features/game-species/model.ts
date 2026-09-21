export interface Quiz {
  image: string;
  answer: string;
}

export function quizProgress(index: number, count: number): number {
  return count === 0 ? 0 : ((index + 1) / count) * 100;
}
