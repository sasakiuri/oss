import React from "react"
import FileSaver from "file-saver"
import axios from "axios"
import {
  Container,
  TextField,
  InputAdornment,
  MenuItem,
  AppBar,
  Dialog,
  Toolbar,
  IconButton,
  Typography,
  Button,
  CardContent,
  Card,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Menu,
  CircularProgress,
} from "@material-ui/core"
import { Edit, GetApp, Translate } from "@material-ui/icons"

type Props = {}

type Length = {
  number: number
  unit: "mm" | "cm" | "m"
}

type Discipline = {
  name: string
  key: string
  distance: Length
  heightOfTarget: Length
  blackAreaSize: Length
}

type Text = {
  title: string
  heightOfTargetCenter: string
  blackAreaSize: string
  eyeHeight: string
  eyeHeightDesc: string
  desiredDistance: string
  desiredDistanceDesc: string
  distance: string
  discipline: string
  disciplineDesc: string
  shootingDistance: string
  blackAimingAreaSize: string
}

const Component: React.FC<Props> = (props: Props) => {
  const enText: Text = {
    title: "Target Calculator",
    heightOfTargetCenter: "Height of Target Center",
    blackAreaSize: "Black Area Size",
    eyeHeight: "Eye Height",
    eyeHeightDesc: "Please enter the height from the floor to your eye.",
    desiredDistance: "Desired Distance to Target",
    desiredDistanceDesc:
      "Please enter the distance to the position where you want to place the target.",
    distance: "Distance",
    discipline: "Discipline",
    disciplineDesc:
      "Please select the discipline ( or create custom discipline).",
    shootingDistance: "Shooting Distance",
    blackAimingAreaSize: "Black Aiming Area Size",
  }

  const jaText: Text = {
    title: "標的を計算",
    heightOfTargetCenter: "標的の中心の高さ",
    blackAreaSize: "黒い領域の大きさ",
    eyeHeight: "目の高さ",
    eyeHeightDesc: "床から目までの高さを入力してください",
    desiredDistance: "標的を設置したい距離",
    desiredDistanceDesc: "標的を設置したい位置までの距離を入力してください。",
    distance: "距離",
    discipline: "種目",
    disciplineDesc: "種目を選択 (あるいはカスタム種目を作成) してください。",
    shootingDistance: "射撃距離",
    blackAimingAreaSize: "黒い領域のサイズ",
  }

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
  const [text, setText] = React.useState<Text>(jaText)
  const [lang, setLang] = React.useState<string>("ja")
  const [isTargetDownloding, setIsTargetDownloding] = React.useState<boolean>(
    false
  )

  const [isDisciplineDialogOpen, setIsDisciplineDialogOpen] = React.useState<
    boolean
  >(false)

  const [isReadonly, setIsReadonly] = React.useState<boolean>(false)

  const [heightOfEye, setHeightOfEye] = React.useState<Length>({
    number: 170,
    unit: "cm",
  })

  const [distanceToTarget, setDistanceToTarget] = React.useState<Length>({
    number: 5,
    unit: "m",
  })

  const [discipline, setDiscipline] = React.useState<Discipline>({
    name: "Custom",
    key: "CUSTOM",
    distance: { number: 50, unit: "m" },
    heightOfTarget: { number: 75, unit: "cm" },
    blackAreaSize: { number: 11.24, unit: "cm" },
  })

  const handleDisciplineDialogClose = () => {
    setIsDisciplineDialogOpen(false)
  }

  const disciplineMap = new Map<string, Discipline>([
    [
      "AR10",
      {
        name: "10m Air Rifle",
        key: "AR10",
        distance: { number: 10, unit: "m" },
        heightOfTarget: { number: 140, unit: "cm" },
        blackAreaSize: { number: 3.05, unit: "cm" },
      },
    ],
    [
      "FR50",
      {
        name: "50m Rifle",
        key: "FR50",
        distance: { number: 50, unit: "m" },
        heightOfTarget: { number: 75, unit: "cm" },
        blackAreaSize: { number: 11.24, unit: "cm" },
      },
    ],
    [
      "FR300",
      {
        name: "300m Rifle",
        key: "FR300",
        distance: { number: 300, unit: "m" },
        heightOfTarget: { number: 300, unit: "cm" },
        blackAreaSize: { number: 60, unit: "cm" },
      },
    ],
    [
      "AP10",
      {
        name: "10m Air Pistol",
        key: "AP10",
        distance: { number: 10, unit: "m" },
        heightOfTarget: { number: 140, unit: "cm" },
        blackAreaSize: { number: 5.95, unit: "cm" },
      },
    ],
    [
      "RFP",
      {
        name: "25m Rapid Fire Pistol",
        key: "RFP",
        distance: { number: 25, unit: "m" },
        heightOfTarget: { number: 140, unit: "cm" },
        blackAreaSize: { number: 50, unit: "cm" },
      },
    ],
    [
      "STP",
      {
        name: "25m Precision Pistol",
        key: "STP",
        distance: { number: 25, unit: "m" },
        heightOfTarget: { number: 140, unit: "cm" },
        blackAreaSize: { number: 20, unit: "cm" },
      },
    ],
    [
      "FP",
      {
        name: "50m Pistol",
        key: "FP",
        distance: { number: 50, unit: "m" },
        heightOfTarget: { number: 75, unit: "cm" },
        blackAreaSize: { number: 20, unit: "cm" },
      },
    ],
  ])

  const handleDisciplineChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    if (e.target.value === "CUSTOM") {
      setIsReadonly(false)
      setDiscipline({ ...discipline, name: "Custom", key: "CUSTOM" })
      return
    }

    const key: string = e.target.value
    const newDiscipline: Discipline | undefined = disciplineMap.get(key)

    if (newDiscipline === undefined) {
      setIsReadonly(false)
      setDiscipline({ ...discipline, name: "Custom", key: "CUSTOM" })
      return
    }

    setIsReadonly(true)
    setDiscipline({
      ...discipline,
      name: newDiscipline.name,
      key: newDiscipline.key,
      distance: newDiscipline.distance,
      heightOfTarget: newDiscipline.heightOfTarget,
      blackAreaSize: newDiscipline.blackAreaSize,
    })
  }

  const elmDisciplineList = new Array<React.ReactNode>()

  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(e.currentTarget)
  }

  const handleMenuItemClick = (
    e: React.MouseEvent<HTMLElement>,
    lang: string
  ) => {
    if (lang === "ja") {
      setLang("ja")
      setText(jaText)
      return
    }
    setLang("en")
    setText(enText)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  disciplineMap.forEach((val: Discipline, key: string) => {
    elmDisciplineList.push(
      <MenuItem key={key} value={key}>
        {val.name}
      </MenuItem>
    )
  })

  const heightOfTarget: number =
    discipline.heightOfTarget.number *
    (1 -
      (1 - heightOfEye.number / discipline.heightOfTarget.number) *
        (1 - distanceToTarget.number / discipline.distance.number))

  const blackAreaSize: number =
    (discipline.blackAreaSize.number * distanceToTarget.number) /
    discipline.distance.number

  const handleSaveClick = (e: React.MouseEvent<HTMLElement>): void => {
    ;(async () => {
      setIsTargetDownloding(true)

      const res = await axios.post(
        "https://gunman.nilay.jp/api/v1/home-targets",
        { blackAreaSize: { number: blackAreaSize, unit: "cm" } },
        {
          responseType: "arraybuffer",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/pdf",
          },
        }
      )

      const blob: Blob = new Blob([res.data], {
        type: "application/pdf",
      })

      FileSaver.saveAs(blob, "Home_Taget.pdf")
      setIsTargetDownloding(false)
    })()
  }

  return (
    <React.Fragment>
      <Dialog
        fullScreen
        open={true}
        onClose={(e: React.MouseEvent<HTMLElement>): void => {}}
      >
        <AppBar>
          <Container maxWidth={"sm"}>
            <Toolbar>
              {/* <IconButton
                edge="start"
                color="inherit"
                onClick={(e: React.MouseEvent<HTMLElement>): void => {}}
                aria-label="close"
              >
                <ArrowBackIos />
              </IconButton> */}
              <Typography
                variant="h6"
                style={{ flexGrow: 1, marginLeft: "1rem" }}
              >
                {text.title}
              </Typography>

              <IconButton onClick={handleMenuClick} color="inherit">
                <Translate />
              </IconButton>

              <Menu
                anchorEl={anchorEl}
                keepMounted
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
              >
                <MenuItem
                  selected={lang === "en"}
                  onClick={(e: React.MouseEvent<HTMLElement>) =>
                    handleMenuItemClick(e, "en")
                  }
                >
                  English
                </MenuItem>
                <MenuItem
                  selected={lang === "ja"}
                  onClick={(e: React.MouseEvent<HTMLElement>) =>
                    handleMenuItemClick(e, "ja")
                  }
                >
                  日本語
                </MenuItem>
              </Menu>
              <Button
                color="inherit"
                onClick={handleSaveClick}
                disabled={isTargetDownloding}
                startIcon={
                  isTargetDownloding ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    <GetApp />
                  )
                }
              >
                Get Target
              </Button>
            </Toolbar>
          </Container>
        </AppBar>
        <Container maxWidth={"sm"} style={{ marginTop: "5rem" }}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {text.heightOfTargetCenter}
              </Typography>
              <Typography variant="h5" component="h2">
                {Math.round(heightOfTarget * 100) / 100}&nbsp;cm
              </Typography>
              <Typography
                color="textSecondary"
                gutterBottom
                style={{ marginTop: "1rem" }}
              >
                {text.blackAreaSize}
              </Typography>
              <Typography variant="h5" component="h2">
                {Math.round(blackAreaSize * 100) / 100}&nbsp;cm
              </Typography>
            </CardContent>
          </Card>
          <TextField
            label={text.eyeHeight}
            helperText={text.eyeHeight}
            value={heightOfEye.number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              setHeightOfEye({
                ...heightOfEye,
                number: Number(e.target.value),
              })
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  {heightOfEye.unit}
                </InputAdornment>
              ),
            }}
            type="number"
            variant="outlined"
            style={{ marginTop: "1.5rem" }}
            fullWidth
            required
          />
          <TextField
            label={text.desiredDistance}
            helperText={text.desiredDistanceDesc}
            value={distanceToTarget.number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              setDistanceToTarget({
                ...distanceToTarget,
                number: Number(e.target.value),
              })
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  {distanceToTarget.unit}
                </InputAdornment>
              ),
            }}
            type="number"
            variant="outlined"
            style={{ marginTop: "1.5rem" }}
            fullWidth
            required
          />

          <List>
            <ListItem>
              <ListItemText
                primary={discipline.name}
                secondary={
                  <React.Fragment>
                    <span
                      style={{
                        display: "block",
                        marginTop: "0.75rem",
                        marginBottom: 0,
                      }}
                    >
                      {text.distance}: {discipline.distance.number}&nbsp;m
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: "0.25rem",
                        marginBottom: 0,
                      }}
                    >
                      {text.heightOfTargetCenter}:{" "}
                      {discipline.heightOfTarget.number}
                      &nbsp;cm
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: "0.25rem",
                        marginBottom: 0,
                      }}
                    >
                      {text.blackAreaSize}: {discipline.blackAreaSize.number}
                      &nbsp;cm
                    </span>
                  </React.Fragment>
                }
              />
            </ListItem>
            <ListItemSecondaryAction>
              <IconButton
                onClick={(e: React.MouseEvent<HTMLElement>): void => {
                  setIsDisciplineDialogOpen(true)
                }}
              >
                <Edit />
              </IconButton>
            </ListItemSecondaryAction>
          </List>
        </Container>
      </Dialog>
      <Dialog
        onClose={handleDisciplineDialogClose}
        open={isDisciplineDialogOpen}
      >
        <DialogTitle>{text.discipline}</DialogTitle>
        <DialogContent>
          <TextField
            select
            label={text.discipline}
            fullWidth
            required
            value={discipline.key}
            onChange={handleDisciplineChange}
            helperText={text.disciplineDesc}
            variant="outlined"
            style={{ marginTop: "3rem" }}
          >
            {elmDisciplineList}
            <MenuItem key={1} value={"CUSTOM"}>
              Custom
            </MenuItem>
          </TextField>
          <TextField
            label={text.shootingDistance}
            value={discipline.distance.number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              setDiscipline({
                ...discipline,
                distance: {
                  ...discipline.distance,
                  number: Number(e.target.value),
                },
              })
            }}
            InputProps={{
              readOnly: isReadonly,
              endAdornment: (
                <InputAdornment position="end">
                  {discipline.distance.unit}
                </InputAdornment>
              ),
            }}
            type="number"
            variant="outlined"
            style={{ marginTop: "1.5rem" }}
            fullWidth
            required
          />

          <TextField
            label={text.heightOfTargetCenter}
            value={discipline.heightOfTarget.number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              setDiscipline({
                ...discipline,
                heightOfTarget: {
                  ...discipline.heightOfTarget,
                  number: Number(e.target.value),
                },
              })
            }}
            InputProps={{
              readOnly: isReadonly,
              endAdornment: (
                <InputAdornment position="end">
                  {discipline.heightOfTarget.unit}
                </InputAdornment>
              ),
            }}
            type="number"
            variant="outlined"
            style={{ marginTop: "1.5rem" }}
            fullWidth
            required
          />

          <TextField
            label={text.blackAimingAreaSize}
            value={discipline.blackAreaSize.number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              setDiscipline({
                ...discipline,
                blackAreaSize: {
                  ...discipline.blackAreaSize,
                  number: Number(e.target.value),
                },
              })
            }}
            InputProps={{
              readOnly: isReadonly,
              endAdornment: (
                <InputAdornment position="end">
                  {discipline.blackAreaSize.unit}
                </InputAdornment>
              ),
            }}
            type="number"
            variant="outlined"
            style={{ marginTop: "1.5rem" }}
            fullWidth
            required
          />
          <DialogActions>
            <Button onClick={handleDisciplineDialogClose} color="primary">
              OK
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </React.Fragment>
  )
}

export default Component
