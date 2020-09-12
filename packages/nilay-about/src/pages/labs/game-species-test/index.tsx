import React, { useState } from "react"

import Container from "@material-ui/core/Container"
import Toolbar from "@material-ui/core/Toolbar"
import Typography from "@material-ui/core/Typography"
import BottomNavigation from "@material-ui/core/BottomNavigation"
import BottomNavigationAction from "@material-ui/core/BottomNavigationAction"
import AppBar from "@material-ui/core/AppBar"
import Card from "@material-ui/core/Card"
import CardHeader from "@material-ui/core/CardHeader"
import CardMedia from "@material-ui/core/CardMedia"
import CardActions from "@material-ui/core/CardActions"
import LinearProgress from "@material-ui/core/LinearProgress"
import Switch from "@material-ui/core/Switch"
import FormControlLabel from "@material-ui/core/FormControlLabel"

import SkipNext from "@material-ui/icons/SkipNext"
import Refresh from "@material-ui/icons/Refresh"
import Visibility from "@material-ui/icons/Visibility"

import Skeleton from "@material-ui/lab/Skeleton"

import { Quiz, quizList as quizListOrg } from "./Quiz"

const shuffleArray = function <T>(arr: Array<T>): Array<T> {
  const resArr: Array<T> = [...arr]

  for (let i = resArr.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1))
    const tmp = resArr[i]
    resArr[i] = resArr[r]
    resArr[r] = tmp
  }

  return resArr
}

type Props = {}

const Component: React.FC<Props> = (props: Props) => {
  const [quizList, setQuizList] = useState<Array<Quiz>>(
    shuffleArray(quizListOrg)
  )
  const [showingAnswer, setShowingAnswer] = useState<boolean>(false)
  const [number, setNumber] = useState<number>(0)
  const [autoPlay, setAutoPlay] = useState<boolean>(false)
  const [timer, setTimer] = useState(null)

  const setUpNextQuiz = () => {
    if (number === quizList.length - 1) {
      setQuizList(shuffleArray(quizListOrg))
      setNumber(0)
      setShowingAnswer(false)

      return
    }

    const nextNumber: number = number + 1
    setNumber(nextNumber)
    setShowingAnswer(false)
  }

  const handleNextClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setUpNextQuiz()
  }

  const handeShowAnswerClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setShowingAnswer(true)
  }

  const handleResetClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setQuizList(shuffleArray(quizListOrg))
    setNumber(0)
    setShowingAnswer(false)
  }

  const handleAutoPlayClick = (e: React.ChangeEvent<HTMLButtonElement>) => {

  }

  return (
    <React.Fragment>
      <AppBar>
        <Container maxWidth={"sm"}>
          <Toolbar>
            <Typography
              variant="h6"
              style={{ flexGrow: 1, marginLeft: "1rem" }}
            >
              狩猟鳥獣スライドショー
            </Typography>
          </Toolbar>
        </Container>
      </AppBar>
      <Container maxWidth={"sm"} style={{ marginTop: "5rem" }}>
        <Card variant="outlined">
          <LinearProgress
            value={(100 * number) / quizList.length}
            variant="determinate"
          />

          <CardHeader
            title={
              showingAnswer ? (
                quizList[number].answer
              ) : (
                <Skeleton width="33%" animation="wave" />
              )
            }
          />
          <CardMedia
            image={quizList[number].image}
            title={quizList[number].answer}
          />
          <CardActions>
            <FormControlLabel
              control={
                <Switch
                  onChange={handleAutoPlayClick}
                  checked={autoPlay}
                  color="primary"
                />
              }
              label="自動再生"
            />
          </CardActions>
        </Card>
        <img src={quizList[number].image} />
      </Container>
      <AppBar
        position="fixed"
        color="primary"
        style={{ top: "auto", bottom: 0 }}
      >
        <BottomNavigation showLabels>
          <BottomNavigationAction
            onClick={handleNextClick}
            label="次へ"
            icon={<SkipNext />}
          />
          <BottomNavigationAction
            onClick={handeShowAnswerClick}
            label="正解を表示"
            icon={<Visibility />}
          />
          <BottomNavigationAction
            onClick={handleResetClick}
            label="リセット"
            icon={<Refresh />}
          />
        </BottomNavigation>
      </AppBar>
    </React.Fragment>
  )
}

export default Component
