import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StorageUnavailableNotice } from '@/components/labs';

describe('StorageUnavailableNotice', () => {
  it('says nothing while the browser can save', () => {
    const { container } = render(<StorageUnavailableNotice available language="ja" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says, as a status, that the settings will not come back', () => {
    render(<StorageUnavailableNotice available={false} language="en" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'This browser cannot save settings. The form returns to its defaults next time you open it.',
    );
  });
});
