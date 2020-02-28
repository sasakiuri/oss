import React from "react";
import { RouteComponentProps } from "react-router-dom";
import { Container, LinearProgress } from "@material-ui/core";
import styled from "styled-components";
import Query from "../../../interface-adapter/query/news-get/v1/web-api-query";
import Interactor from "../../../use-case/news-get/v1/interactor";
import InputPort from "../../../use-case/news-get/v1/input-port";
import News from "../../../use-case/news-get/v1/news";
import Response from "../../../use-case/news-get/v1/response";
import Req from "../../../use-case/news-get/v1/request";
import Skelton from "./skelton";

interface Props extends RouteComponentProps<{ id: string }> { }

interface State {
  isLoading: boolean;
  news: News | null;
}

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
`;

const Date = styled.div`
  padding-top: 3rem;
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
`;

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
`;

const StyledLinearProgress = styled(LinearProgress)`
  background: #abbed1;
  & > .MuiLinearProgress-barColorPrimary {
    background: #56799c;
  }
`;

class Component extends React.Component<Props, State> {
  private _interactor: InputPort;

  public constructor(props: Props) {
    super(props);
    this._interactor = new Interactor(new Query());

    document.title = "...：お知らせ：Nilay/About";
    this.state = {
      isLoading: true,
      news: null
    };
  }

  public componentDidMount(): void {
    document.title = "......：お知らせ：Nilay/About";
    (async () => {
      const request: Req = { id: this.props.match.params.id };
      const response: Response = await this._interactor.handle(request);
      await this.timeout(500);
      this.setState({
        isLoading: false,
        news: response.news
      });

      document.title = `${response.news.title}：お知らせ：Nilay/About`;
    })();
  }

  public render(): React.ReactNode {


    return (
      <React.Fragment>
        {(() => {
          if (this.state.isLoading) {
            return <StyledLinearProgress />;
          }
        })()}

        <Container maxWidth="lg">
          {(() => {
            if (this.state.isLoading) {
              return <Skelton />;
            } else if (this.state.news !== null) {
              return (
                <React.Fragment>
                  <Date>
                    {`${this.state.news.date.getFullYear()}年${this.state.news.date.getMonth() +
                      1}月${this.state.news.date.getDate()}日`}
                  </Date>
                  <Title>{this.state.news.title}</Title>
                  <Text
                    dangerouslySetInnerHTML={{
                      __html: this.state.news.summary
                    }}
                  ></Text>
                </React.Fragment>
              );
            }
          })()}
        </Container>
      </React.Fragment>
    );
  }

  private timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default Component;
