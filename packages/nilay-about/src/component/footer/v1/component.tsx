import * as React from "react";

import { Container, Grid } from "@material-ui/core";
import styled from "styled-components";
import { GitHub, Twitter, Facebook, YouTube, Instagram } from "@material-ui/icons";

const Footer = styled.div`
  margin-top: 3rem;
  padding: 24px 0;
  background: #f8f9fa;
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
`;

const FooterListItem = styled.a`
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
const FooterListTitle = styled.div`
  display: block;
  line-height: 36px;
  height: 36px;
  margin: 0;
  width: 100%;
  text-align: left;
  color: #2c3e50;
  font-size: 1rem;
  margin-bottom: 1rem;
  font-weight: 700;
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

const CopyRight = styled.div`
  color: #2c3e50;
  text-align: center;
  font-size: 0.9rem;
`;

class Component extends React.Component {
  public render(): React.ReactNode {
    return (
      <Footer>
        <Container maxWidth="lg">
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FooterListTitle>Services</FooterListTitle>
              <FooterListItem href="https://www.nilay.jp/" target="_blank" rel="noopener noreferrer">Knowledge</FooterListItem>
              <FooterListItem href="https://knowledge.nilay.jp/" target="_blank" rel="noopener noreferrer">E-commerce</FooterListItem>
              <FooterListItem href="https://gunman.nilay.jp/" target="_blank" rel="noopener noreferrer">Gunman</FooterListItem>
            </Grid>
            <Grid item xs={12}>
              <SocialLink
                href="https://twitter.com/NilayJP"
                aria-label="Twitter"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Twitter style={{ fontSize: "32px" }} />
              </SocialLink>
              <SocialLink
                href="https://www.facebook.com/NilaySport/"
                aria-label="Facebook"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Facebook style={{ fontSize: "32px" }} />
              </SocialLink>
              <SocialLink
                href="https://www.youtube.com/channel/UC03yJGn_rZV2MTpr-ZrMZrA"
                aria-label="YouTube"
                target="_blank"
                rel="noopener noreferrer"
              >
                <YouTube style={{ fontSize: "32px" }} />
              </SocialLink>
              <SocialLink
                href="https://www.instagram.com/NilayJP/"
                aria-label="Instagram"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram style={{ fontSize: "32px" }} />
              </SocialLink>
              <SocialLink
                href="https://github.com/nilay-jp"
                aria-label="GitHub"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GitHub style={{ fontSize: "32px" }} />
              </SocialLink>
            </Grid>
            <Grid item xs={12}>
              <CopyRight>© {new Date().getFullYear()} Nilay</CopyRight>
            </Grid>
          </Grid>
        </Container>
      </Footer>
    );
  }
}

export default Component;
