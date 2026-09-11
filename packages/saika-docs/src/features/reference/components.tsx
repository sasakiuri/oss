// SPDX-License-Identifier: MIT
'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import {
  CheckboxGroup,
  FormActions,
  FormSection,
  NumberInput,
  ReadOnlyField,
  TextAreaField,
  TextField,
} from '@/shared/ui/form';
import { NavigationMenu } from '@/shared/ui/navigation-menu';
import { Badge, Card, DetailPanel, NoticeBanner, RecordMeta, Skeleton, Stepper } from '@/shared/ui/panels';
import { Select } from '@/shared/ui/select';
import { Tabs } from '@/shared/ui/tabs';

const formSchema = z.object({
  name: z.string().trim().min(1, '名前を入力してください。'),
  count: z.coerce.number().int().min(1).max(99),
  note: z.string().max(200),
});
export function ComponentExamples() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', count: 1, note: '' },
  });
  const [level, setLevel] = useState('reader');
  const [checks, setChecks] = useState<string[]>([]);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const mutation = useMutation({ mutationFn: async (value: z.output<typeof formSchema>) => value });
  return (
    <div className="grid gap-6">
      <NavigationMenu
        label="サンプル"
        links={[
          { href: '/reference/', label: '一覧・部品' },
          { href: '/reference/material/', label: 'Material UI' },
        ]}
      />
      <Card title="プロフィール">
        <div className="flex items-center gap-3">
          <Avatar name="Saika" />
          <Badge>閲覧者</Badge>
          <ActionMenu
            actions={[
              { label: '更新履歴', onSelect: () => setDialog(true) },
              { label: '編集（準備中）', onSelect: () => undefined, disabled: true },
            ]}
          />
        </div>
      </Card>
      <Card title="入力フォーム">
        <Stepper steps={['入力', '確認', '完了']} current={mutation.isSuccess ? 2 : 0} />
        <form className="mt-5 grid gap-4" onSubmit={handleSubmit((value) => mutation.mutate(value))}>
          <FormSection title="入力例">
            <TextField label="名前" required {...register('name')} error={errors.name?.message} />
            <NumberInput label="人数" min={1} max={99} {...register('count')} error={errors.count?.message} />
            <TextAreaField label="メモ" maxLength={200} {...register('note')} error={errors.note?.message} />
            <Select
              label="表示区分"
              value={level}
              onValueChange={setLevel}
              options={[
                { value: 'reader', label: '閲覧者' },
                { value: 'editor', label: '編集者' },
              ]}
            />
            <CheckboxGroup label="通知" options={['更新情報', 'リリース情報']} value={checks} onChange={setChecks} />
          </FormSection>
          <FormActions
            busy={mutation.isPending}
            onCancel={() => {
              reset();
              mutation.reset();
            }}
          />
        </form>
        {mutation.isSuccess && <NoticeBanner>入力を受け付けました。この例ではサーバーに保存しません。</NoticeBanner>}
      </Card>
      <Tabs
        label="表示状態"
        items={[
          {
            id: 'detail',
            label: '詳細',
            content: (
              <DetailPanel
                title="入力内容"
                items={[
                  { label: '名前', value: mutation.data?.name ?? '未入力' },
                  { label: '区分', value: level === 'reader' ? '閲覧者' : '編集者' },
                ]}
              />
            ),
          },
          { id: 'loading', label: '読み込み中', content: <Skeleton /> },
          {
            id: 'error',
            label: 'エラー',
            content: <NoticeBanner error>通信に失敗しました。もう一度お試しください。</NoticeBanner>,
          },
        ]}
      />
      <Card title="確認・更新履歴">
        <dl>
          <ReadOnlyField label="公開状態" value="公開" />
        </dl>
        <RecordMeta created="2026-09-01" updated="2026-09-10" />
        <div className="mt-4 flex gap-3">
          <Dialog
            open={dialog}
            onOpenChange={setDialog}
            title="更新履歴"
            description="変更した内容の一覧"
            trigger={<Button variant="outline">履歴を見る</Button>}
          >
            <ol className="list-inside list-decimal">
              <li>文書検索にタグの絞り込みを追加</li>
              <li>日付の入力エラーを修正</li>
            </ol>
          </Dialog>
          <Dialog
            side
            open={sheet}
            onOpenChange={setSheet}
            title="表示設定"
            description="サイドパネルの例"
            trigger={<Button variant="outline">設定を開く</Button>}
          >
            <p>キーボードの Escape でも閉じられます。</p>
          </Dialog>
        </div>
      </Card>
    </div>
  );
}
