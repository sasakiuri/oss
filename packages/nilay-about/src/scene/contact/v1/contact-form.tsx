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
import Query from "../../../interface-adapter/query/contact-message-send-query/v1/web-api-query"
import Request from "../../../use-case/contact-message-send/v1/request"
import Response from "../../../use-case/contact-message-send/v1/response"
import SuccessMessage from "./success-message";
import ErrorMessage from "./error-message";
import * as EmailValidator from "email-validator";

interface Props {
  className?: string;
}
interface State {
  uuid: string;
  successMessage: boolean;
  hasError: boolean;
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
  error: {
    title: string;
    message: string;
  };
}


class Component extends React.Component<Props, State> {
  private _query: Query;

  public constructor(props: Props) {
    super(props);

    this.state = {
      uuid: "",
      successMessage: false,
      hasError: false,
      requiresReply: false,
      isLoading: false,
      emailAddress: "",
      title: "",
      body: "",
      errorMessages: {
        emailAddress: "",
        title: "",
        body: ""
      },
      error: {
        title: "",
        message: ""
      }
    };

    this._query = new Query();
  }

  checkReplyRequirement = () => (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ requiresReply: !this.state.requiresReply });
  };

  gotoNext = () => (e: React.MouseEvent<HTMLElement>) => {
    (async () => {

      this.setState({ isLoading: true, successMessage: false, hasError: false });
      const error = this.state.error;
      const errorMessages = this.state.errorMessages;
      errorMessages.title = "";
      errorMessages.body = "";
      errorMessages.emailAddress = "";

      await this._timeout(750);

      if (this.state.title.trim() === "") {
        errorMessages.title = "タイトルは必須です。";
      }

      if (this.state.body.trim() === "") {
        errorMessages.body = "お問い合わせ内容は必須です。";
      }

      if (this.state.requiresReply && !this._validateEmailAddress(this.state.emailAddress)) {
        errorMessages.emailAddress = "Ｅメールアドレスの形式が不正です。";
      }

      if (this._hasError()) {
        error.message = "入力値が不正です。入力された値を修正の上、もう一度送信ボタンを押してください。";
        this.setState({
          isLoading: false,
          hasError: true,
          error: error
        });
        return;
      }

      const req: Request = {
        email: this.state.emailAddress.trim(),
        message: this.state.body.trim(),
        title: this.state.title.trim(),
        requiresReply: this.state.requiresReply
      };

      try {
        const res: Response = await this._query.write(req);
        this.setState({
          isLoading: false,
          successMessage: true,
          uuid: res.uuid,
          requiresReply: false,
          emailAddress: "",
          title: "",
          body: "",
        });
        return;
      } catch (error) {
        console.error(error);
        console.log(error);
        error.message = "何らかのエラーが発生しました。しばらく時間をおいてから送信するか、Ｅメールなどで直接お問い合わせください。";
        this.setState({
          isLoading: false,
          hasError: true,
          error: error
        });
      }

    })();
  };

  private _validateEmailAddress(emailAddress: string): boolean {
    if (emailAddress.trim() === "") {
      return false;
    }

    return EmailValidator.validate(emailAddress.trim());
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

  closeSuccessMessage = () => (e: React.MouseEvent<HTMLElement>) => {
    this.setState({ successMessage: false });
  };

  public render(): React.ReactNode {
    return (
      <React.Fragment>
        <Card variant="outlined" style={{ textAlign: "left" }}>
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
                error={this.state.errorMessages.emailAddress.length > 0}
                id="emailAddress"
                type="email"
                label="Ｅメールアドレス"
                value={this.state.emailAddress}
                style={{ marginBottom: "1rem" }}
                helperText={this.state.errorMessages.emailAddress}
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
              error={this.state.errorMessages.title.length > 0}
              id="title"
              label="タイトル"
              value={this.state.title}
              style={{ marginBottom: "1rem" }}
              helperText={this.state.errorMessages.title}
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
              error={this.state.errorMessages.body.length > 0}
              label="お問い合わせ内容"
              multiline
              rows="4"
              value={this.state.body}
              helperText={this.state.errorMessages.body}
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
            <SuccessMessage visibility={this.state.successMessage}
              onClick={this.closeSuccessMessage()}
              uuid={this.state.uuid}
            />
            <ErrorMessage visibility={this.state.hasError}
              onClick={this.closeSuccessMessage()}
              title="エラー"
              message={this.state.error.message}
            />
          </CardContent>
          <Fade in={this.state.isLoading}>
            <LinearProgress />
          </Fade>
        </Card>
      </React.Fragment>
    );
  }
}

export default Component;
