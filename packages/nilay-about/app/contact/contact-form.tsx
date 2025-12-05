"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useContactForm } from "@/hooks";
import { useUIStore } from "@/store";
import {
  Button,
  Input,
  Textarea,
  Label,
  Checkbox,
  Card,
  CardContent,
  Alert,
  AlertTitle,
  AlertDescription,
  Progress,
} from "@/components/ui";
import { LuSend, LuX } from "react-icons/lu";
import { contactFormSchema, type ContactFormData } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const { alert, showSuccess, showError, clearAlert } = useUIStore();
  const mutation = useContactForm();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      requiresReply: false,
      email: "",
      title: "",
      message: "",
    },
  });

  const requiresReply = watch("requiresReply");

  const onSubmit = async (data: ContactFormData) => {
    try {
      const result = await mutation.mutateAsync(data);

      if (result.hasError) {
        showError("送信エラー", result.errorMessage);
        return;
      }

      showSuccess(
        "送信完了",
        `お問い合わせありがとうございます。— お問い合わせ番号：${result.uuid}`
      );
      reset();
    } catch {
      showError(
        "送信エラー",
        "何らかのエラーが発生しました。しばらく時間をおいてから送信するか、Ｅメールなどで直接お問い合わせください。"
      );
    }
  };

  const isLoading = isSubmitting || mutation.isPending;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="requiresReply"
              disabled={isLoading}
              {...register("requiresReply")}
            />
            <Label htmlFor="requiresReply" className="cursor-pointer">
              返信を希望する
            </Label>
          </div>

          {requiresReply && (
            <div className="space-y-2">
              <Label htmlFor="email">
                Ｅメールアドレス <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                disabled={isLoading}
                className={cn(errors.email && "border-destructive")}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              disabled={isLoading}
              className={cn(errors.title && "border-destructive")}
              {...register("title")}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">
              お問い合わせ内容 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="message"
              rows={4}
              disabled={isLoading}
              className={cn(errors.message && "border-destructive")}
              {...register("message")}
            />
            {errors.message && (
              <p className="text-sm text-destructive">
                {errors.message.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isLoading}>
            送信
            <LuSend className="ml-2 h-4 w-4" />
          </Button>

          {alert && (
            <Alert
              variant={alert.type === "success" ? "success" : "destructive"}
            >
              <div className="flex items-start justify-between">
                <div>
                  <AlertTitle>{alert.title}</AlertTitle>
                  <AlertDescription>{alert.message}</AlertDescription>
                </div>
                <button
                  type="button"
                  onClick={clearAlert}
                  className="shrink-0 p-1 hover:bg-secondary rounded"
                >
                  <LuX className="h-4 w-4" />
                </button>
              </div>
            </Alert>
          )}
        </form>

        {isLoading && <Progress indeterminate className="mt-4" />}
      </CardContent>
    </Card>
  );
}
