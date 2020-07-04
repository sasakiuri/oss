import React from "react"
import { Link, graphql } from "gatsby"
import {
  Button,
  Card,
  CardContent,
  Typography,
  CardActions,
  CssBaseline,
  Container,
  Grid,
} from "@material-ui/core"
import { AppBar, BasicTitle, Footer, Layout, SEO } from "../../component"

type Props = {}

const Component: React.FC<Props> = (props: Props) => {
  return (
    <Layout>
      <CssBaseline />
      <AppBar value={-1} />

      <SEO />

      <Container maxWidth="lg">
        <BasicTitle title="ツール" subtitle="Labs" />

        <Grid container spacing={3}>
          <Grid item xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography
                  color="textSecondary"
                  variant="h5"
                  component="h2"
                  gutterBottom
                >
                  home-target
                </Typography>
                <Typography variant="body2" component="p">
                  距離に応じた標的の高さと黒丸のサイズを計算します。自宅での練習等にご活用ください。※印刷時には「実際のサイズ」をご指定ください。
                </Typography>
              </CardContent>
              <CardActions>
                <Button component={Link} to={`home-target`} size="small">
                  Learn More
                </Button>
              </CardActions>
            </Card>
          </Grid>
        </Grid>
      </Container>
      <Footer />
    </Layout>
  )
}

export default Component
