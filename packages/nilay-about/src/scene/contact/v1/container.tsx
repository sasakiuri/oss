import * as React from "react";
import { Container, Grid } from "@material-ui/core";
import styled from "styled-components";
import { Twitter, Facebook, YouTube, Instagram } from "@material-ui/icons";
import BasicTitle from "../../../component/basic-title/v1/component";
import ContactForm from "./contact-form";

const Scene = styled.div`
  text-align: left;
  margin-top: 2rem;
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
`;

const SocialLink = styled.a`
  diplay: inline-block;
  line-height: 48px;
  height: 48px;
  width: 48px;
  text-align: centerl;
  & + & {
    margin-left: 1rem;
  }
  color: #2c3e50;
  &: hover {
    color: #2c3e50;
  }
`;

const ContactAddress = styled.a`
  display: block;
  line-height: 36px;
  height: 36px;
  margin: 0;
  width: 100%;
  text-align: left;
  color: #2c3e50;
  font-size: 1rem;
  text-decoration: none;
  color: #2c3e50;
  &: hover {
    color: #2c3e50;
  }
`;

interface Props {
  className?: string;
}

class Component extends React.Component<Props> {
  public constructor(props: Props) {
    super(props);
  }

  public componentDidMount(): void {
    document.title = "お問い合わせ：Nilay/About";
  }

  public render(): React.ReactNode {
    return (
      <React.Fragment>
        <Container maxWidth="sm">
          <BasicTitle title="お問い合わせ" subtitle="Contact" />
        </Container>
        {/* <Container maxWidth="sm">
          <ContactForm />
        </Container> */}
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
      </React.Fragment>
    );
  }
}

export default Component;
