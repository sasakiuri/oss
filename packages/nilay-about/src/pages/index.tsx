import React from "react"
import { graphql } from "gatsby"
import { IndexHomeQuery } from "../../types/graphql-types"
import CssBaseline from "@material-ui/core/CssBaseline"
import Container from "@material-ui/core/Container"
import Grid from "@material-ui/core/Grid"
import Cloud from "@material-ui/icons/Cloud"
import MenuBook from "@material-ui/icons/MenuBook"
import ShoppingCart from "@material-ui/icons/ShoppingCart"
import { config } from "@fortawesome/fontawesome-svg-core"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFlask } from "@fortawesome/free-solid-svg-icons"
import "@fortawesome/fontawesome-svg-core/styles.css"
import { AppBar, BasicTitle, Footer, Layout, SEO } from "../component"
import {
  HomeImage,
  CardTitle,
  CardText,
  CardIcon,
  CardLink,
} from "../view/home"

config.autoAddCss = false

type Props = {
  data: IndexHomeQuery
}

const Component: React.FC<Props> = (props: Props) => {
  return (
    <Layout>
      <CssBaseline />
      <AppBar value={0} />

      <SEO />

      <Container maxWidth="lg">
        <BasicTitle title="ようこそ！！" subtitle="Nilay/About" />
        <HomeImage
          src={props.data.tanuki?.childImageSharp?.fluid}
          alt={"たぬき"}
          href={"https://www.irasutoya.com/2015/03/blog-post_346.html"}
        />
        <Grid container spacing={3}>
          <Grid item xs={12} sm={4}>
            <CardIcon>
              <MenuBook style={{ fontSize: "64px" }} />
            </CardIcon>
            <CardTitle>Knowledge</CardTitle>
            <CardLink
              href="https://knowledge.nilay.jp/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Knowledge に移動
            </CardLink>
            <CardText>
              銃・射撃・狩猟に関する知識を収集・調査し紹介しています。申請や申込の方法についても記載しておりますので必要なときにご覧ください。
            </CardText>
          </Grid>
          <Grid item xs={12} sm={4}>
            <CardIcon>
              <ShoppingCart style={{ fontSize: "64px" }} />
            </CardIcon>
            <CardTitle>E-commerce</CardTitle>
            <CardLink
              href="https://www.nilay.jp/"
              target="_blank"
              rel="noopener noreferrer"
            >
              通信販売サイトに移動
            </CardLink>
            <CardText>
              射撃用品・狩猟用品・鳥獣被害対策用品を販売しています。幅広い種類の商品を取り揃えるようにしておりますのでぜひご利用ください。
            </CardText>
          </Grid>
          <Grid item xs={12} sm={4}>
            <CardIcon>
              <Cloud style={{ fontSize: "64px" }} />
            </CardIcon>
            <CardTitle>Gunman</CardTitle>
            <CardLink
              href="https://gunman.nilay.jp/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Gunman に移動
            </CardLink>
            <CardText>
              申請書・申込書・各種添付書類を作成することができます。この他に火薬類、銃、各種証明書の管理機能も現在試験的に運用中です。
            </CardText>
          </Grid>
          <Grid container spacing={3} style={{ marginTop: "3rem" }}>
            <Grid item xs={12} sm={4}>
              <CardIcon>
                <FontAwesomeIcon icon={faFlask} size="2x" />
              </CardIcon>
              <CardTitle>Labs</CardTitle>
              <CardLink href="labs">Labs に移動</CardLink>
              <CardText>試験的に作成したツールなどを公開しています。</CardText>
            </Grid>
            {/* <Grid item xs={12} sm={4}>
            <CardIcon>
              <Cloud style={{ fontSize: "64px" }} />
            </CardIcon>
            <CardTitle>Labs</CardTitle>
            <CardLink
              href="https://gunman.nilay.jp/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Blog に移動
            </CardLink>
            <CardText>ブログです。</CardText>
          </Grid> */}
          </Grid>
        </Grid>
      </Container>
      <Footer />
    </Layout>
  )
}

export default Component

export const query = graphql`
  query IndexHome {
    tanuki: file(relativePath: { eq: "home-tanuki.png" }) {
      childImageSharp {
        fluid(maxWidth: 200) {
          ...GatsbyImageSharpFluid_withWebp
        }
      }
    }
  }
`
