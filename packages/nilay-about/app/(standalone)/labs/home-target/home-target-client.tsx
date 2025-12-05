"use client";

import { Button, Card, CardContent, Input, Label } from "@/components/ui";
import { LuDownload, LuPencil, LuLoader } from "react-icons/lu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AppHeader,
  AppLayout,
  LanguageMenu,
} from "@/app/(standalone)/_components";
import {
  useHomeTargetStore,
  calculateHeightOfTarget,
  calculateBlackAreaSize,
} from "./_store";

type Text = {
  title: string;
  heightOfTargetCenter: string;
  blackAreaSize: string;
  eyeHeight: string;
  eyeHeightDesc: string;
  desiredDistance: string;
  desiredDistanceDesc: string;
  distance: string;
  discipline: string;
  disciplineDesc: string;
  shootingDistance: string;
  blackAimingAreaSize: string;
};

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
  disciplineDesc: "Please select the discipline ( or create custom discipline).",
  shootingDistance: "Shooting Distance",
  blackAimingAreaSize: "Black Aiming Area Size",
};

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
};

const disciplineMap = new Map([
  [
    "AR10",
    {
      name: "10m Air Rifle",
      key: "AR10",
      distance: { number: 10, unit: "m" as const },
      heightOfTarget: { number: 140, unit: "cm" as const },
      blackAreaSize: { number: 3.05, unit: "cm" as const },
    },
  ],
  [
    "FR50",
    {
      name: "50m Rifle",
      key: "FR50",
      distance: { number: 50, unit: "m" as const },
      heightOfTarget: { number: 75, unit: "cm" as const },
      blackAreaSize: { number: 11.24, unit: "cm" as const },
    },
  ],
  [
    "FR300",
    {
      name: "300m Rifle",
      key: "FR300",
      distance: { number: 300, unit: "m" as const },
      heightOfTarget: { number: 300, unit: "cm" as const },
      blackAreaSize: { number: 60, unit: "cm" as const },
    },
  ],
  [
    "AP10",
    {
      name: "10m Air Pistol",
      key: "AP10",
      distance: { number: 10, unit: "m" as const },
      heightOfTarget: { number: 140, unit: "cm" as const },
      blackAreaSize: { number: 5.95, unit: "cm" as const },
    },
  ],
  [
    "RFP",
    {
      name: "25m Rapid Fire Pistol",
      key: "RFP",
      distance: { number: 25, unit: "m" as const },
      heightOfTarget: { number: 140, unit: "cm" as const },
      blackAreaSize: { number: 50, unit: "cm" as const },
    },
  ],
  [
    "STP",
    {
      name: "25m Precision Pistol",
      key: "STP",
      distance: { number: 25, unit: "m" as const },
      heightOfTarget: { number: 140, unit: "cm" as const },
      blackAreaSize: { number: 20, unit: "cm" as const },
    },
  ],
  [
    "FP",
    {
      name: "50m Pistol",
      key: "FP",
      distance: { number: 50, unit: "m" as const },
      heightOfTarget: { number: 75, unit: "cm" as const },
      blackAreaSize: { number: 20, unit: "cm" as const },
    },
  ],
]);

export function HomeTargetClient() {
  const {
    language,
    heightOfEye,
    distanceToTarget,
    discipline,
    isReadonly,
    isDownloading,
    isDisciplineDialogOpen,
    setLanguage,
    setHeightOfEye,
    setDistanceToTarget,
    setDiscipline,
    setIsReadonly,
    setIsDownloading,
    setIsDisciplineDialogOpen,
  } = useHomeTargetStore();

  const heightOfTarget = calculateHeightOfTarget(heightOfEye, distanceToTarget, discipline);
  const blackAreaSize = calculateBlackAreaSize(distanceToTarget, discipline);

  const text = language === "ja" ? jaText : enText;

  const handleDisciplineChange = (key: string) => {
    if (key === "CUSTOM") {
      setIsReadonly(false);
      setDiscipline({ ...discipline, name: "Custom", key: "CUSTOM" });
      return;
    }

    const newDiscipline = disciplineMap.get(key);
    if (!newDiscipline) {
      setIsReadonly(false);
      setDiscipline({ ...discipline, name: "Custom", key: "CUSTOM" });
      return;
    }

    setIsReadonly(true);
    setDiscipline({ ...newDiscipline });
  };

  const handleSaveClick = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(
        "https://gunman.nilay.jp/api/v1/home-targets",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/pdf",
          },
          body: JSON.stringify({
            blackAreaSize: { number: blackAreaSize, unit: "cm" },
          }),
        }
      );

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Home_Target.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const headerActions = (
    <>
      <LanguageMenu language={language} onLanguageChange={setLanguage} />
      <Button
        variant="ghost"
        onClick={handleSaveClick}
        disabled={isDownloading}
        className="text-primary-foreground hover:bg-primary/80"
      >
        {isDownloading ? (
          <LuLoader className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LuDownload className="mr-2 h-4 w-4" />
        )}
        Get Target
      </Button>
    </>
  );

  return (
    <AppLayout header={<AppHeader title={text.title} actions={headerActions} />}>
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {text.heightOfTargetCenter}
                </p>
                <p className="text-2xl font-medium">
                  {Math.round(heightOfTarget * 100) / 100}&nbsp;cm
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {text.blackAreaSize}
                </p>
                <p className="text-2xl font-medium">
                  {Math.round(blackAreaSize * 100) / 100}&nbsp;cm
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label htmlFor="eyeHeight">{text.eyeHeight}</Label>
          <div className="relative">
            <Input
              id="eyeHeight"
              type="number"
              value={heightOfEye.number}
              onChange={(e) =>
                setHeightOfEye({
                  ...heightOfEye,
                  number: Number(e.target.value),
                })
              }
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {heightOfEye.unit}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{text.eyeHeightDesc}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="distanceToTarget">{text.desiredDistance}</Label>
          <div className="relative">
            <Input
              id="distanceToTarget"
              type="number"
              value={distanceToTarget.number}
              onChange={(e) =>
                setDistanceToTarget({
                  ...distanceToTarget,
                  number: Number(e.target.value),
                })
              }
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {distanceToTarget.unit}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {text.desiredDistanceDesc}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="space-y-1">
            <p className="font-medium">{discipline.name}</p>
            <p className="text-sm text-muted-foreground">
              {text.distance}: {discipline.distance.number} m
            </p>
            <p className="text-sm text-muted-foreground">
              {text.heightOfTargetCenter}: {discipline.heightOfTarget.number} cm
            </p>
            <p className="text-sm text-muted-foreground">
              {text.blackAreaSize}: {discipline.blackAreaSize.number} cm
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDisciplineDialogOpen(true)}
          >
            <LuPencil className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog.Root
        open={isDisciplineDialogOpen}
        onOpenChange={setIsDisciplineDialogOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] max-h-[90vh] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg bg-background p-6 shadow-lg">
            <Dialog.Title className="text-lg font-medium">
              {text.discipline}
            </Dialog.Title>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>{text.discipline}</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  value={discipline.key}
                  onChange={(e) => handleDisciplineChange(e.target.value)}
                >
                  {Array.from(disciplineMap.entries()).map(([key, d]) => (
                    <option key={key} value={key}>
                      {d.name}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom</option>
                </select>
                <p className="text-sm text-muted-foreground">
                  {text.disciplineDesc}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{text.shootingDistance}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={discipline.distance.number}
                    readOnly={isReadonly}
                    onChange={(e) =>
                      setDiscipline({
                        ...discipline,
                        distance: {
                          ...discipline.distance,
                          number: Number(e.target.value),
                        },
                      })
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {discipline.distance.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{text.heightOfTargetCenter}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={discipline.heightOfTarget.number}
                    readOnly={isReadonly}
                    onChange={(e) =>
                      setDiscipline({
                        ...discipline,
                        heightOfTarget: {
                          ...discipline.heightOfTarget,
                          number: Number(e.target.value),
                        },
                      })
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {discipline.heightOfTarget.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{text.blackAimingAreaSize}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={discipline.blackAreaSize.number}
                    readOnly={isReadonly}
                    onChange={(e) =>
                      setDiscipline({
                        ...discipline,
                        blackAreaSize: {
                          ...discipline.blackAreaSize,
                          number: Number(e.target.value),
                        },
                      })
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {discipline.blackAreaSize.unit}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setIsDisciplineDialogOpen(false)}>OK</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AppLayout>
  );
}
