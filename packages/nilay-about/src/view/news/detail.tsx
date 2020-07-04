import React, { useState, useEffect } from "react"
import { useStaticQuery, graphql } from "gatsby"
import { RouteComponentProps } from "@reach/router"
import { CssBaseline, Container, LinearProgress } from "@material-ui/core"
import { IndexNewsDetail } from "../../../types/graphql-types"
import styled from "styled-components"
import { AppBar, Layout, Footer, SEO, ShareButton } from "../../component"
import { News } from "../../domain/model"
import {
  InputPort,
  Interactor,
  Request,
  Response,
} from "../../use-case/news-get"
import { WebApiNewsGetGateway as NewsGetGateway } from "../../adapter/gateway/news-get"
import Skelton from "./detail-skelton"

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 3rem;
  text-align: left;
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 100;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 200;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 300;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 400;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Bold");
    font-weight: bold;
  }
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Hiragino Sans", "Noto Sans CJK JP", "Original Yu Gothic", "Yu Gothic",
    sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
    "Noto Sans Emoji";
`

const Date = styled.div`
  padding-top: 1rem;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  text-align: left;
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 100;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 200;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 300;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 400;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Bold");
    font-weight: bold;
  }
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Hiragino Sans", "Noto Sans CJK JP", "Original Yu Gothic", "Yu Gothic",
    sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
    "Noto Sans Emoji";
`

const Text = styled.div`
  font-size: 1rem;
  margin-bottom: 3rem;
  text-align: left;
  line-height: 1.75;
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 100;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 200;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 300;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Medium");
    font-weight: 400;
  }
  @font-face {
    font-family: "Original Yu Gothic";
    src: local("Yu Gothic Bold");
    font-weight: bold;
  }
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Hiragino Sans", "Noto Sans CJK JP", "Original Yu Gothic", "Yu Gothic",
    sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
    "Noto Sans Emoji";
`

const StyledShareButton = styled(ShareButton)`
  padding-top: 3rem;
  text-align: right;
`

type SeoProps = {
  title?: string
  lang?: string
  charSet?: string
  description?: string
  slug?: string
  featuredImage?: string
}
type Props = {} & RouteComponentProps<{ id: string }>

const Component: React.FC<Props> = (props: Props) => {
  const data: IndexNewsDetail = useStaticQuery<IndexNewsDetail>(
    graphql`
      query IndexNewsDetail {
        site {
          siteMetadata {
            title
            description
            siteUrl
            image
            phoneNumber
            emailAddress
            social {
              twitter
              facebook
              facebookAppId
              youtube
              instagram
              github
            }
          }
        }
      }
    `
  )

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [news, setNews] = useState<News | null>(null)
  const [seoProps, setSeoProps] = useState<SeoProps>({
    title: `……：お知らせ`,
    description: `Nilay からのお知らせです。商品の入荷情報やアップデート情報をお届けします。`,
    slug: `news/${props.id}`,
  })
  const useCase: InputPort = new Interactor(new NewsGetGateway())

  useEffect(() => {
    ;(async () => {
      const uReq: Request = { id: props.id }
      const uRes: Response = await useCase.interact(uReq)
      setNews(uRes.news)
      setIsLoading(false)
      setSeoProps({
        ...seoProps,
        title: `${uRes.news.title}：お知らせ`,
        description: uRes.news.summary.substring(0, 144),
      })
    })()
  }, [])

  const slug: string = `news/${props.id}`

  return (
    <Layout>
      <CssBaseline />
      <AppBar value={1} />
      <SEO
        slug={slug}
        title={seoProps.title}
        description={seoProps.description}
      />

      <Container maxWidth="md">
        {(() => {
          if (isLoading) {
            return <Skelton />
          } else if (news !== null) {
            return (
              <React.Fragment>
                <StyledShareButton
                  title={seoProps.title}
                  twitter={data.site.siteMetadata.social.twitter}
                  url={`${data.site.siteMetadata.siteUrl}/${slug}`}
                />
                <Date>
                  {`${news.date.getFullYear()}年${
                    news.date.getMonth() + 1
                  }月${news.date.getDate()}日`}
                </Date>
                <Title>{news.title}</Title>
                <Text
                  dangerouslySetInnerHTML={{
                    __html: news.summary,
                  }}
                ></Text>
              </React.Fragment>
            )
          }
        })()}
      </Container>
      <Footer />
    </Layout>
  )
}

export default Component
