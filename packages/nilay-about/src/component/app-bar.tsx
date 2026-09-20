import * as React from "react"
import { Link } from "gatsby"
import {
  AppBar as MuiAppBar,
  Container,
  makeStyles,
  Tab,
  Tabs,
  Theme,
} from "@material-ui/core"
import styled from "styled-components"

const useStyles = makeStyles((theme: Theme) => ({
  root: {},
  appBar: {
    backgroundColor: "#fff",
  },

  tab: {
    color: "rgba(0, 0, 0, 0.54)",
  },

  indicator: {
    backgroundColor: "rgb(232,118,0)",
  },
  selected: {
    color: "#2c3e50",
  },
}))

type Props = { value: number }

const Component: React.FC<Props> = (props: Props) => {
  const classes = useStyles()

  return (
    <div className={classes.root}>
      <MuiAppBar position="sticky" className={classes.appBar}>
        <Container maxWidth="lg">
          <Tabs
            classes={{ indicator: classes.indicator }}
            value={props.value}
            variant="scrollable"
            scrollButtons="off"
            aria-label="nav tabs example"
          >
            <Tab
              className={classes.tab}
              classes={{ selected: classes.selected }}
              component={Link}
              value={0}
              label="Nilay/About"
              to="/"
            />
            <Tab
              className={classes.tab}
              classes={{ selected: classes.selected }}
              component={Link}
              value={1}
              label="ニュース"
              to="/news"
            />
            <Tab
              className={classes.tab}
              classes={{ selected: classes.selected }}
              component={Link}
              value={2}
              label="お問い合わせ"
              to="/contact"
            />
          </Tabs>
        </Container>
      </MuiAppBar>
    </div>
  )
}

export const AppBar = Component
