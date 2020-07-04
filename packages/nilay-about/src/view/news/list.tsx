import React, { useState, useEffect } from "react"
import { Link, RouteComponentProps } from "@reach/router"
import {
  CssBaseline,
  Container,
  List as MuiList,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
} from "@material-ui/core"
import { Announcement } from "@material-ui/icons"
import { AppBar, BasicTitle, Footer, Layout, SEO } from "../../component"
import Skelton from "./list-item-skelton"
import { News } from "../../domain/model"
import { InputPort, Interactor, Response } from "../../use-case/news-list"
import { WebApiNewsListGateway as NewsListGateway } from "../../adapter/gateway/news-list"

type Props = {} & RouteComponentProps

const Component: React.FC<Props> = (props: Props) => {
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [newsList, setNewsList] = useState<Array<News>>(new Array())
  const useCase: InputPort = new Interactor(new NewsListGateway())

  useEffect(() => {
    ;(async () => {
      const uRes: Response = await useCase.interact()
      setNewsList(uRes.newsList)
      setIsLoading(false)
    })()
  }, [])

  const title: string = `お知らせ`
  const subtitle: string = `News`
  const description: string = `Nilay からのお知らせです。商品の入荷情報やアップデート情報をお届けします。`
  const slug: string = `news`

  return (
    <Layout>
      <CssBaseline />
      <AppBar value={1} />
      <SEO slug={slug} title={title} description={description} />
      <Container maxWidth="md">
        <BasicTitle title={title} subtitle={subtitle} />
        <MuiList>
          {(() => {
            if (isLoading) {
              return <Skelton />
            } else {
              return (
                <>
                  {newsList.map(
                    (news: News, index: number, newsList: Array<News>) => {
                      return (
                        <ListItem
                          button
                          divider={index !== newsList.length - 1}
                          alignItems="flex-start"
                          component={Link}
                          to={`${news.id}`}
                          key={news.id}
                        >
                          <ListItemAvatar style={{ color: "#2c3e50" }}>
                            <Announcement />
                          </ListItemAvatar>
                          <ListItemText
                            style={{ color: "#2c3e50" }}
                            primary={
                              <React.Fragment>
                                <Typography style={{ marginBottom: "0.5rem" }}>
                                  {news.title}
                                </Typography>
                              </React.Fragment>
                            }
                            secondary={
                              <React.Fragment>
                                <Typography
                                  component="span"
                                  variant="body2"
                                  color="textPrimary"
                                >
                                  {news.date.getFullYear()}年
                                  {news.date.getMonth() + 1}月
                                  {news.date.getDate()}日
                                </Typography>
                                &nbsp;—&nbsp;
                                {news.summary
                                  .replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, "")
                                  .substring(0, 140) + "……"}
                              </React.Fragment>
                            }
                          />
                        </ListItem>
                      )
                    }
                  )}
                </>
              )
            }
          })()}
        </MuiList>
      </Container>
      <Footer />
    </Layout>
  )
}

export default Component
