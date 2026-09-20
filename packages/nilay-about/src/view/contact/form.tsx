import React, { useState } from "react"
import { WebApiContactMessageGateway as ContactMessageGateway } from "../../adapter/gateway/contact-message-send"
import {
  Fade,
  LinearProgress,
  Button,
  Checkbox,
  Collapse,
  TextField,
  Card,
  CardContent,
  FormControlLabel,
  IconButton,
} from "@material-ui/core"
import { Alert, AlertTitle } from "@material-ui/lab"
import { Send, Close } from "@material-ui/icons"
import * as EmailValidator from "email-validator"
import {
  InputPort,
  Interactor,
  Request,
  Response,
} from "../../use-case/contact-message-send"

type Props = {}

type Payload = {
  uuid: string
  requiresReply: boolean
  emailAddress: string
  title: string
  body: string
}

type ValidationError = {
  emailAddress: string
  title: string
  body: string
}

type AlertMessage = {
  isVisible: boolean
  type: "error" | "success"
  title: string
  message: string
}

const Component: React.FC<Props> = (props: Props) => {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [payload, setPayload] = useState<Payload>({
    uuid: "",
    requiresReply: false,
    emailAddress: "",
    title: "",
    body: "",
  })
  const [validationError, setValidationError] = useState<ValidationError>({
    emailAddress: "",
    title: "",
    body: "",
  })
  const [alertMessage, setAlertMessage] = useState<AlertMessage>({
    isVisible: false,
    type: "success",
    title: "",
    message: "",
  })

  const useCase: InputPort = new Interactor(new ContactMessageGateway())

  const timeout = (ms: number): Promise<Function> => {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  const validateEmailAddress = (addr: string): boolean => {
    if (addr.trim() === "") {
      return false
    }

    return EmailValidator.validate(addr.trim())
  }

  const gotoNext = () => async (
    e: React.MouseEvent<HTMLElement>
  ): Promise<void> => {
    setIsLoading(true)

    let validationErrorExists: boolean = false
    const newValidationError: ValidationError = {
      emailAddress: "",
      title: "",
      body: "",
    }

    await timeout(750)

    if (payload.title.trim() === "") {
      newValidationError.title = "タイトルは必須です。"
      validationErrorExists = true
    }

    if (payload.body.trim() === "") {
      newValidationError.body = "お問い合わせ内容は必須です。"
      validationErrorExists = true
    }

    if (payload.requiresReply && !validateEmailAddress(payload.emailAddress)) {
      newValidationError.emailAddress = "Ｅメールアドレスの形式が不正です。"
      validationErrorExists = true
    }

    if (validationErrorExists) {
      setIsLoading(false)
      setValidationError({ ...validationError, ...newValidationError })
      setAlertMessage({
        isVisible: true,
        type: "error",
        title: "不正な入力値エラー",
        message:
          "入力値が不正です。入力された値を修正の上、もう一度送信ボタンを押してください。",
      })

      return
    }

    const uReq: Request = {
      email: payload.emailAddress.trim(),
      message: payload.body.trim(),
      title: payload.title.trim(),
      requiresReply: payload.requiresReply,
    }

    try {
      const uRes: Response = await useCase.interact(uReq)

      setIsLoading(false)
      setAlertMessage({
        isVisible: true,
        type: "success",
        title: "送信完了",
        message: `お問い合わせありがとうございます。— お問い合わせ番号：${uRes.uuid}`,
      })
      setPayload({
        uuid: "",
        requiresReply: false,
        emailAddress: "",
        title: "",
        body: "",
      })
      setValidationError({
        emailAddress: "",
        title: "",
        body: "",
      })

      return
    } catch (error) {
      console.error(error)

      setIsLoading(false)
      setAlertMessage({
        isVisible: true,
        type: "error",
        title: "送信エラー",
        message:
          "何らかのエラーが発生しました。しばらく時間をおいてから送信するか、Ｅメールなどで直接お問い合わせください。",
      })
      setValidationError({
        emailAddress: "",
        title: "",
        body: "",
      })
    }
  }

  return (
    <React.Fragment>
      <Card variant="outlined" style={{ textAlign: "left" }}>
        <CardContent>
          <FormControlLabel
            style={{ marginBottom: "1.5rem" }}
            control={
              <Checkbox
                checked={payload.requiresReply}
                onChange={e =>
                  setPayload({
                    ...payload,
                    requiresReply: !payload.requiresReply,
                  })
                }
                value="checkedB"
                color="primary"
                disabled={isLoading}
              />
            }
            label="返信を希望する"
          />
          <Collapse in={payload.requiresReply}>
            <TextField
              required
              fullWidth
              error={validationError.emailAddress.length > 0}
              id="emailAddress"
              type="email"
              label="Ｅメールアドレス"
              value={payload.emailAddress}
              style={{ marginBottom: "1rem" }}
              helperText={validationError.emailAddress}
              InputLabelProps={{
                shrink: true,
              }}
              variant="outlined"
              disabled={isLoading}
              onChange={e =>
                setPayload({ ...payload, emailAddress: e.target.value })
              }
            />
          </Collapse>
          <TextField
            required
            fullWidth
            error={validationError.title.length > 0}
            id="title"
            label="タイトル"
            value={payload.title}
            style={{ marginBottom: "1rem" }}
            helperText={validationError.title}
            InputLabelProps={{
              shrink: true,
            }}
            variant="outlined"
            disabled={isLoading}
            onChange={e => setPayload({ ...payload, title: e.target.value })}
          />
          <TextField
            required
            fullWidth
            id="body"
            error={validationError.body.length > 0}
            label="お問い合わせ内容"
            multiline
            rows="4"
            value={payload.body}
            helperText={validationError.body}
            InputLabelProps={{
              shrink: true,
            }}
            variant="outlined"
            disabled={isLoading}
            onChange={e => setPayload({ ...payload, body: e.target.value })}
          />

          <Button
            style={{ marginTop: "2rem" }}
            variant="contained"
            color="primary"
            onClick={gotoNext()}
            disabled={isLoading}
            endIcon={<Send />}
          >
            送信
          </Button>

          <Collapse in={alertMessage.isVisible}>
            <Alert
              severity={alertMessage.type}
              style={{ marginTop: "2rem" }}
              action={
                <IconButton
                  aria-label="close"
                  color="inherit"
                  size="small"
                  onClick={e =>
                    setAlertMessage({
                      ...alertMessage,
                      isVisible: false,
                      title: "",
                      message: "",
                    })
                  }
                >
                  <Close fontSize="inherit" />
                </IconButton>
              }
            >
              <AlertTitle>{alertMessage.title}</AlertTitle>
              <div>{alertMessage.message}</div>
            </Alert>
          </Collapse>
        </CardContent>
        <Fade in={isLoading}>
          <LinearProgress />
        </Fade>
      </Card>
    </React.Fragment>
  )
}

export const Form = Component
