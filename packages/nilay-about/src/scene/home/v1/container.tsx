import * as React from "react";
import { Container, Grid } from "@material-ui/core";
import { Cloud, MenuBook, ShoppingCart } from "@material-ui/icons";
import tanuki from "../../../Resources/0db7cad9ab39158b8ca1e2c3dd3e144dfa67c852.26a46334.png";
import TopImage from "./top-image";
import CardTitle from "./card-title";
import CardText from "./card-text";
import CardIcon from "./card-icon";
import CardLink from "./card-link";
import BasicTitle from "../../../component/basic-title/v1/component";

interface Props {
  className?: string;
}

class Component extends React.Component<Props> {
  public constructor(props: Props) {
    super(props);
  }

  public componentDidMount(): void {
    document.title = "Nilay/About";
  }

  public render(): React.ReactNode {
    return (
      <Container maxWidth="lg">
        <BasicTitle title="ようこそ！！" subtitle="Nilay/About" />
        <TopImage src={tanuki} alt="たぬき" />
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
        </Grid>
      </Container>
    );
  }
}

export default Component;
