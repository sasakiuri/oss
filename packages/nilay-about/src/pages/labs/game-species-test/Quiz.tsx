import img001_001 from "./img/001_001.jpg"
import img002_001 from "./img/002_001.jpg"
import img003_001 from "./img/003_001.jpg"
import img004_001 from "./img/004_001.jpg"
import img005_001 from "./img/005_001.jpg"
import img006_001 from "./img/006_001.jpg"
import img007_001 from "./img/007_001.jpg"
import img008_001 from "./img/008_001.jpg"
import img009_001 from "./img/009_001.jpg"
import img010_001 from "./img/010_001.jpg"

export interface Quiz {
  image: string
  answer: string
}
export const quizList: Array<Quiz> = [
  {
    image: img001_001,
    answer: "マガモ",
  },
  {
    image: img002_001,
    answer: "カルガモ",
  },
  {
    image: img003_001,
    answer: "ヨシガモ",
  },
  {
    image: img004_001,
    answer: "コガモ",
  },
  {
    image: img005_001,
    answer: "オナガガモ",
  },
  {
    image: img006_001,
    answer: "ヒドリガモ",
  },
]
