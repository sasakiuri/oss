import React from "react"
import { Router } from "@reach/router"
import { List, Detail } from "../view/news"

type Props = {}

const Component: React.FC<Props> = (props: Props) => {
  return (
    <Router basepath="news">
      <List path="/" />
      <Detail path="/:id" />
    </Router>
  )
}

export default Component
