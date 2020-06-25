import React from "react";
import { Announcement } from "@material-ui/icons";
import { Link } from "react-router-dom";
import {
  Container,
  List as MuiList,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
  LinearProgress
} from "@material-ui/core";
import styled from "styled-components";
import BasicTitle from "../../component/basic-title/v1/component";
import Skelton from "./list-item-skelton";
import { News } from "../../domain/model"
import { InputPort, Interactor, Response } from "../../use-case/news-list"
import { WebApiNewsListGateway as NewsListGateway } from "../../adapter/gateway/news-list"

interface Props {
  className?: string;
}

interface State {
  isLoading: boolean;
  newsList: Array<News>;
}

const StyledLinearProgress = styled(LinearProgress)`
  background: #abbed1;
  & > .MuiLinearProgress-barColorPrimary {
    background: #56799c;
  }
`;
class Component extends React.Component<Props, State> {
  private _useCase: InputPort;

  public constructor(props: Props) {
    super(props);
    this._useCase = new Interactor(new NewsListGateway());

    this.state = {
      isLoading: true,
      newsList: new Array<News>()
    };
  }

  public componentDidMount(): void {
    document.title = "お知らせ：Nilay/About";

    (async () => {
      const response: Response = await this._useCase.interact();
      await this.timeout(500);
      this.setState({
        isLoading: false,
        newsList: response.newsList
      });
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
          <BasicTitle title="お知らせ" subtitle="News" />
          <MuiList>
            {(() => {
              if (this.state.isLoading) {
                return <Skelton />;
              } else {
                return (
                  <>
                    {
                      this.state.newsList.map(
                        (news: News, index: number, newsList: Array<News>) => {
                          return (
                            <ListItem
                              button
                              divider={index !== newsList.length - 1}
                              alignItems="flex-start"
                              component={Link}
                              to={`news/${news.id}`}
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
                                {news.date.getMonth() + 1}月{news.date.getDate()}日
                              </Typography>
                                    &nbsp;—&nbsp;
                              {news.summary.replace(
                                        /<("[^"]*"|'[^']*'|[^'">])*>/g,
                                        ""
                                      )}
                                  </React.Fragment>
                                }
                              />
                            </ListItem>
                          );
                        }
                      )
                    }
                  </>
                );
              }
            })()}

          </MuiList>
        </Container>
      </React.Fragment>
    );
  }

  private timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const StyledComponent = styled(Component)``;

export default StyledComponent;
