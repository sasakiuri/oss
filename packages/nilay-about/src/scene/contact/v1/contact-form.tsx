import * as React from "react";
import {
  Fade,
  LinearProgress,
  Button,
  Checkbox,
  Collapse,
  TextField,
  Card,
  CardContent,
  FormControlLabel
} from "@material-ui/core";
import { Send } from "@material-ui/icons";

interface Props {
  className?: string;
}
interface State {
  requiresReply: boolean;
  isLoading: boolean;
  emailAddress: string;
  title: string;
  body: string;
  errorMessages: {
    emailAddress: string;
    title: string;
    body: string;
  };
}

class Component extends React.Component<Props, State> {
  public constructor(props: Props) {
    super(props);
    this.state = {
      requiresReply: false,
      isLoading: false,
      emailAddress: "",
      title: "",
      body: "",
      errorMessages: {
        emailAddress: "",
        title: "",
        body: ""
      }
    };
  }

  checkReplyRequirement = () => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    this.setState({ requiresReply: !this.state.requiresReply });
  };

  gotoNext = () => (e: React.MouseEvent<HTMLElement>) => {
    (async () => {
      this.setState({ isLoading: true });
      const requiresReply: boolean = this.state.requiresReply;
      const emailAddress: string = this.state.emailAddress;
      const title: string = this.state.title;
      const body: string = this.state.body;

      const errorMessages = this.state.errorMessages;

      if (title.trim() === "") {
        errorMessages.title = "タイトルは必須です。";
      }

      if (body.trim() === "") {
        errorMessages.body = "お問い合わせ内容は必須です。";
      }

      if (requiresReply && !this._validateEmailAddress(emailAddress)) {
        errorMessages.emailAddress = "Ｅメールアドレスの形式が不正です。";
      }

      await this._timeout(750);

      this.setState({ errorMessages: errorMessages });

      if (this._hasError()) {
        this.setState({ isLoading: false });
        return;
      }
    })();
  };

  private _validateEmailAddress(emailAddress: string): boolean {
    if (emailAddress.trim() === "") {
      return false;
    }

    return true;
  }

  private _hasError(): boolean {
    return (
      this.state.errorMessages.title !== "" ||
      this.state.errorMessages.body !== "" ||
      this.state.errorMessages.emailAddress !== ""
    );
  }

  private _timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public render(): React.ReactNode {
    return (
      <React.Fragment>
        <Card variant="outlined" style={{ textAlign: "left" }}>
          <Fade in={this.state.isLoading}>
            <LinearProgress />
          </Fade>
          <CardContent>
            <FormControlLabel
              style={{ marginBottom: "1.5rem" }}
              control={
                <Checkbox
                  checked={this.state.requiresReply}
                  onChange={this.checkReplyRequirement()}
                  value="checkedB"
                  color="primary"
                  disabled={this.state.isLoading}
                />
              }
              label="返信を希望する"
            />
            <Collapse in={this.state.requiresReply}>
              <TextField
                required
                fullWidth
                id="emailAddress"
                type="email"
                label="Ｅメールアドレス"
                defaultValue=""
                style={{ marginBottom: "1rem" }}
                helperText=""
                InputLabelProps={{
                  shrink: true
                }}
                variant="outlined"
                disabled={this.state.isLoading}
                onChange={e => this.setState({ emailAddress: e.target.value })}
              />
            </Collapse>
            <TextField
              required
              fullWidth
              id="title"
              label="タイトル"
              defaultValue=""
              style={{ marginBottom: "1rem" }}
              helperText=""
              InputLabelProps={{
                shrink: true
              }}
              variant="outlined"
              disabled={this.state.isLoading}
              onChange={e => this.setState({ title: e.target.value })}
            />
            <TextField
              required
              fullWidth
              id="body"
              label="お問い合わせ内容"
              multiline
              rows="4"
              defaultValue=""
              helperText=""
              InputLabelProps={{
                shrink: true
              }}
              variant="outlined"
              disabled={this.state.isLoading}
              onChange={e => this.setState({ body: e.target.value })}
            />
            <Button
              style={{ marginTop: "2rem" }}
              variant="contained"
              color="primary"
              onClick={this.gotoNext()}
              disabled={this.state.isLoading}
              endIcon={<Send />}
            >
              送信
            </Button>
          </CardContent>
        </Card>
      </React.Fragment>
    );
  }
}

export default Component;
