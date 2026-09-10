// SPDX-License-Identifier: MIT
'use client';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { useTheme } from 'next-themes';
import { useMemo, useState } from 'react';

import styles from './material.module.scss';

export function MaterialExample() {
  const { resolvedTheme } = useTheme();
  const theme = useMemo(() => {
    const dark = resolvedTheme === 'dark';
    return createTheme({
      typography: { fontFamily: '"Inter Variable", "Noto Sans JP Variable", sans-serif' },
      shape: { borderRadius: 8 },
      palette: {
        mode: dark ? 'dark' : 'light',
        primary: { main: dark ? '#e8e7e2' : '#242422' },
        background: { default: dark ? '#171716' : '#fcfcfb', paper: dark ? '#171716' : '#fcfcfb' },
        text: { primary: dark ? '#f0efec' : '#20201e', secondary: dark ? '#b8b7b0' : '#62615b' },
        divider: dark ? '#363633' : '#e4e3df',
      },
    });
  }, [resolvedTheme]);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme}>
        <Card variant="outlined" className={styles.example}>
          <CardContent>
            <Stack spacing={3}>
              <Typography component="h2" variant="h5">
                Material UI の入力例
              </Typography>
              <TextField label="タイトル" value={value} onChange={(event) => setValue(event.target.value)} />
              <Button variant="contained" disabled={!value.trim()} onClick={() => setSaved(true)}>
                入力を確認
              </Button>
              {saved && <Alert severity="success">入力を受け付けました。</Alert>}
            </Stack>
          </CardContent>
        </Card>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
