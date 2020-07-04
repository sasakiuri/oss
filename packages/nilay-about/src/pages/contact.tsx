import React from "react"
import { graphql } from "gatsby"
import { IndexContactQuery } from "../../types/graphql-types"
import { CssBaseline, Container, Grid } from "@material-ui/core"
import { Twitter, Facebook, YouTube, Instagram } from "@material-ui/icons"
import { AppBar, BasicTitle, Footer, Layout, SEO } from "../component"
import { Form, ContactAddress, SocialLink, Scene } from "../view/contact"

type Props = {
  data: IndexContactQuery
}

const Component: React.FC<Props> = (props: Props) => {
  const title: string = `お問い合わせ`
  const subtitle: string = `Contact`
  const description: string = `お気軽にお問い合わせください。Email、電話、各種 SNS でもお問い合わせいただけます。`
  const slug: string = `contact`

  return (
    <Layout>
      <CssBaseline />
      <AppBar value={2} />
      <SEO slug={slug} title={title} description={description} />
      <Container maxWidth="sm">
        <BasicTitle title={title} subtitle={subtitle} />
      </Container>
      <Container maxWidth="sm">
        <Form />
      </Container>
      <Container maxWidth="sm">
        <Scene>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <ContactAddress>
                Ｅメールアドレス：contact@mail.nilay.jp
              </ContactAddress>
              <ContactAddress>電話番号：080-7059-1382</ContactAddress>
            </Grid>
            <Grid item xs={12}>
              <SocialLink
                href="https://twitter.com/NilayJP"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Twitter style={{ fontSize: "32px" }} />
              </SocialLink>
              <SocialLink
                href="https://www.facebook.com/NilaySport/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Facebook style={{ fontSize: "32px" }} />
              </SocialLink>
              <SocialLink
                href="https://www.youtube.com/channel/UC03yJGn_rZV2MTpr-ZrMZrA"
                target="_blank"
                rel="noopener noreferrer"
              >
                <YouTube style={{ fontSize: "32px" }} />
              </SocialLink>
              <SocialLink
                href="https://www.instagram.com/NilayJP/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram style={{ fontSize: "32px" }} />
              </SocialLink>
            </Grid>
          </Grid>
        </Scene>
      </Container>
      <Footer />
    </Layout>
  )
}

export default Component

export const query = graphql`
  query IndexContact {
    site {
      siteMetadata {
        emailAddress
        phoneNumber
        social {
          youtube
          twitter
          instagram
          github
          facebookAppId
          facebook
        }
      }
    }
  }
`
